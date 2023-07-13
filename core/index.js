const fs = require('fs');

function runLoaders(options, callback) {
  // 需要处理的资源绝对路径
  const resource = options.resource || '';
  // 需要处理的所有loaders 组成的绝对路径数组
  let loaders = options.loaders || [];
  // loader执行上下文对象 每个loader中的this就会指向这个loaderContext
  const loaderContext = options.context || {};
  // 读取资源内容的方法
  const readResource = options.readResource || fs.readFile.bind(fs);
  // 根据loaders路径数组创建loaders对象        
  loaders = loaders.map(loader => createLoaderObject(loader));
  // 处理loaderContext 也就是loader中的this对象
  loaderContext.resourcePath = resource; // 资源路径的绝对地址
  loaderContext.readResource = readResource; // 读取资源文件的方法
  loaderContext.loaderIndex = 0; // 通过loaderIndex来执行对应的loader
  loaderContext.loaders = loaders; // 所有的loader对象
  loaderContext.data = null;
  // 标识异步loader的对象属性
  loaderContext.async = null;
  loaderContext.callback = null;
  // request属性：保存所有loader路径和资源路径
  // 将其全部转化为inline-loader的形式，同时在结尾拼接了资源路径
  Object.defineProperty(loaderContext, 'request', {
    // 枚举时显示出来
    enumerable: true,
    get: function () {
      return loaderContext.loaders
      .map((l) => l.request)
      .concat(loaderContext.resourcePath || '')
      .join('!');
    }
  });
  // 保存剩下的请求 但不包含自身（以loaderIndex分界） 包含资源路径
  Object.defineProperty(loaderContext, 'remainingRequest', {
    enumerable: true,
    get: function() {
      return loaderContext.loaders
      .slice(loaderContext.loaderIndex + 1)
      .map((i) => i.request)
      .concat(loaderContext.resourcePath)
      .join('!')
    }
  });
  // 保存剩下的请求，包含自身也包含资源路径
  Object.defineProperty(loaderContext, 'currentRequest', {
    enumerable: true,
    get: function() {
      return loaderContext.loaders
      .slice(loaderContext.loaderIndex)
      .map(l => l.request)
      .concat(loaderContext.resourcePath)
      .join('!')
    }
  });
  //已经处理过的loader请求，不包含自身 不包含资源路径
  Object.defineProperty(loaderContext, 'previousRequest', {
    enumerable: true,
    get: function() {
      return loaderContext.loaders
      .slice(0, loaderContext.loaderIndex)
      .map(l => l.request)
      .join('!')
    }
  });
  // 通过代理保存pitch存储的值，pitch方法中的第三个参数可以修改
  // 通过normal中的this.data可以获取到对应loader的pitch方法操作data
  Object.defineProperty(loaderContext, 'data', {
    enumerable: true,
    get: function() {
      return loaderContext.loaders[loaderContext.loaderIndex].data;
    }
  })

  const processOptions = {
    resourceBuffer: null
  };

  // 处理完loaders对象和context上下文对象后
  // 根据流程 开始迭代loaders —— 从pitch阶段开始迭代
  // 按照post -inline - normal - pre 顺序迭代pitch
  iteratePitchingLoaders(processOptions, loaderContext, (err, result) => {
    callback(err, {
      result,
      resourceBuffer: processOptions.resourceBuffer
    })
  })

}

/**
 * 通过loader的绝对路径地址创建loader对象
 * @param {*} loader loader的绝对路径地址
 */
function createLoaderObject(loader) {
  const obj = {
    normal: null, // loader normal 函数本身
    pitch: null, // loader pitch函数
    raw: null, // 表示normal loader处理文件内容时，是否需要将内容转为buffer对象；
    data: null, // pitch阶段通过给data赋值，normal阶段通过this.data取值，用来保存传递的data
    pitchExecuted: false, // 标记这个loader的pitch函数时候已经执行过
    normalExecuted: false, //标记这个loader的normal阶段是否已经执行过
    request: loader, // 保存当前loader资源绝对路径 
  };
  // 按照路径加载loader模块 真实源码中通过loadLoader加载还支持ESM模块，目前实现为支持request模块
  const normalLoader = require(obj.request);
  obj.normal = normalLoader;
  obj.pitch = normalLoader.pitch;
  // 转化时需要buffer/string raw为true时为buffer false时为string
  obj.raw = normalLoader.raw;
  return obj;
}

/**
 * 迭代pitch-loader
 * 核心思路：执行第一个loader的pitch 依次迭代 如果到了最后一个结束 就开始读取文件
 * @param {*} options 定义的processOptions对象，存在一个reourceBuffer属性用来保存未经过loader处理前的buffer类型的资源文件内容
 * @param {*} loaderContext loader上下文对象
 * @param {*} callback 这个方法内部调用了runLoader方法外部传入的callback 用来在回调函数中调用最终的runLoaders方法的结果
 */
function iteratePitchingLoaders(options, loaderContext, callback) {
  // 超出loader个数 说明所有的pitch已经结束，那么此时需要开始读取资源文件内容
  if (loaderContext.loaderIndex >= loaderContext.loaders.length) {
    return processResource(options, loaderContext, callback);
  }

  const currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];
  // 当前loader的pitch已经执行过了 继续递归执行下一个
  if (currentLoaderObject.pitchExecuted) {
    loaderContext.loaderIndex++;
    return iteratePitchingLoaders(options, loaderContext, callback);  
  }

  const pitchFunction = currentLoaderObject.pitch;
  // 标记当前loader pitch已经执行过
  currentLoaderObject.pitchExecuted = true;

  // 如果当前loader不存在pitch阶段
  if (!currentLoaderObject.pitch) {
    return iteratePitchingLoaders(options, loaderContext, callback);
  }

  // 执行pitch阶段 调用loader的pitch函数
  runSyncOrAsyc(
    pitchFunction,
    loaderContext,
    [
      currentLoaderObject.remainingRequest,
      currentLoaderObject.previousRequest,
      currentLoaderObject.data
    ],
    function(err, ...args) {
      if (err) {
        // 存在错误则直接调用callback 表示runLoaders执行完毕
        return callback(err);
      }
      /**
       * 根据返回值 判断是否需要熔断 或者继续执行下一个pitch
       * pitch函数存在返回值 -> 进行熔断 掉头执行normal-loader
       * 不存在返回值 -> 继续迭代下一个 
       */
      const hasArg = args.some(i => i !== undefined);
      if (hasArg) {
        loaderContext.loaderIndex--;
        // 熔断 直接返回调用normal-loader
        iterateNormalLoaders(options, loaderContext, args, callback);
      } else {
        // 这个pitch-loader执行完毕后 继续调用下一个loader
        iteratePitchingLoaders(options, loaderContext, callback);
      }
    }
  )
}
/**
 * 执行loader 同步/异步
 * @param {*} fn 需要被执行的函数
 * @param {*} context loader的上下文对象
 * @param {*} args [remainingRequest,previousRequest,currentLoaderObj.data = {}
 * @param {*} callback 外部传入的callback 也是runLoaders方法的形参 用来表示loader(fn)执行完毕后调用的回调函数
 */
function runSyncOrAsyc(fn, context, args, callback) {
  // 是否同步 默认为同步loader 表示当前loader执行完自动依次迭代执行
  let isSync = true;
  // 表示传入的fn是否已经执行过了 用来标记重复执行 
  let isDone = false;

  // 定义this.callback
  // 同时this.async 通过闭包访问调用innerCallback 表示异步loader执行完毕
  const innerCallback = (context.callback = function() {
    isDone = true;
    // 当调用this.callback时 标记不走loader函数的return了
    isSync = false;
    callback(null, ...arguments);
  })

  // 定义异步 this.async
  // 每次loader调用都会执行runSyncOrAsync都会重新定义一个context.async方法
  context.async = function() {
    isSync = false; // 将本次同步变更为异步
    return innerCallback;
  }
  
  // 调用pitch-loader执行，将this传递成为loaderContext 同时传递三个参数
  // 返回pitch函数的返回值 甄别是否进行熔断
  const result = fn.apply(context, args);

  if (isSync) {
    isDone = true;
    if (result === undefined) {
      return callback();
    }
    // 估计loader返回的是一个Promise 异步loader
    if (result && typeof result === 'object' && typeof result.then === 'function') {
      // 等待Promise结束后，直接熔断 否则Reject 直接callback错误
      return result.then((r) => callback(null, r), callback); 
    }
    // 非Promise且存在执行结果 进行熔断
    return callback(null, result); 
  }
}

function processResource(options, loaderContext, callback) {
  // 重置越界的loaderContext.loaderIndex
  // 达到倒序执行 pre -> normal -> inline- > post
  loaderContext.loaderIndex = loaderContext.loaders.length - 1;
  const resource = loaderContext.resourcePath;
  // 读取文件内容
  loaderContext.readResource(resource, (err, buffer) => {
    if (err) {
      return callback(err);
    }

    // 保存原始文件内容的buffer 相当于processOptions.resourceBuffer = buffer
    options.resourceBuffer = buffer;
    // 同时将读取到的文件内容传入iterateNormalLoaders 进行迭代`normal loader`
    iterateNormalLoaders(options, loaderContext, [buffer], callback);
  })
}

/**
 * 迭代normal-loaders 根据loaderIndex的值进行迭代
 * 核心思路： 迭代完成pitch-loader之后 读取文件 迭代执行normal-loader
 *          或者在pitch-loader中存在返回值 熔断执行normal-loader
 * @param {*} options processOptions对象
 * @param {*} loaderContext loaderContext loader中的this对象
 * @param {*} args [buffer/any]
 * @param {*} callback runLoaders中callback函数
 */
function iterateNormalLoaders(options, loaderContext, args, callback) {
  // 越界元素判断 越界表示所有normal loader处理完毕 直接调用callback返回
  if (loaderContext.loaderIndex < 0) {
    return callback(null, args);
  }
  const currentLoader = loaderContext.loaders[loaderContext.loaderIndex];
  if (currentLoader.normalExecuted) {
    loaderContext.loaderIndex--;
    return iterateNormalLoaders(options, loaderContext, args, callback);
  }
  const normalFunction = currentLoader.normal;
  // 标记为执行过
  currentLoader.normalExecuted = true;
  // 检查是否执行过
  if (!normalFunction) {
    return iterateNormalLoaders(options, loaderContext, args, callback);
  }
  // 根据loader中raw的值 格式化source
  convertArgs(args, currentLoader.raw);
  // 执行loader
  runSyncOrAsyc(normalFunction, loaderContext, args, (err, ...args) => {
    if (err) {
      return callback(err);
    }
    // 继续迭代
    iterateNormalLoaders(options, loaderContext, args, callback);
  })
}

/**
 * 转化资源source的格式
 * @param {*} args [资源]
 * @param {*} raw Boolean 是否需要buffer
 * raw为true 表示需要一个buffer
 * raw为false 表示不需要buffer
 */
function convertArgs(args, raw) {
  if (!raw && Buffer.isBuffer(args[0])) {
    // 不需要buffer
    args[0] = args[0].toString();
  } else if (raw && typeof args[0] === 'string') {
    // 需要Buffer 资源文件是string类型转化为Buffer
    args[0] = Buffer.from(args[0], 'utf-8');
  }
}

module.exports = {
  runLoaders
}