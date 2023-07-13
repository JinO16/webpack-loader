//入口文件

const fs = require('fs');
const path = require('path');
const { runLoaders } = require('./core/index');

// 模块路径

const filePath = path.resolve(__dirname, './title.js');
// 模拟模块内容和.title.js一模一样的内容 省略webpack通过地址解析文件的过程，将解析后的文件内容直接写在这里
const request = 'inline1-loader!inline2-loader!./title.js';

// 模拟webpack配置
const rules = [
  // 普通loader
  {
    test: /\.js$/,
    use: ['normal1-loader', 'normal2-loader'],
  },
  // 前置loader
  {
    test: /\.js$/,
    use: ['pre1-loader', 'pre2-loader'],
    enforce: 'pre'
  },
  // 后置loader
  {
    test: /\.js$/,
    use: ['post1-loader', 'post2-loader'],
    enforce: 'post'
  }
];

// 从文件引入路径中提取inline loader 同时将文件路径中的 -！、-!!、！等标志inline-loader的规则删除掉
const parts = request.replace(/^-?!+/, '').split('!');
// 获取文件路径
const sourcePath = parts.pop();

// 获取inlineLoader
const inlineLoaders = parts;

// 处理rules中的loader规则
const preLoaders = [],
      normalLoaders = [],
      postLoaders = [];

rules.forEach(rule => {
  // 如果匹配的情况
  if (rule.test.test(sourcePath)) {
    switch (rule.enforce) {
      case 'pre':
        preLoaders.push(...rule.use);
        break;
      case 'post':
        postLoaders.push(...rule.use);
        break;
      default:
        normalLoaders.push(...rule.use);
        break;
    }
  }
})

/**
 * 根据inline-loader的规则过滤需要的loader
 * !: 单个！开头的，表示排除所有的normal-loader
 * !!： 两个!!开头的，表示仅剩余 inline-loader 排除所有的其他loader(pre  normal post)
 * -!:以-！开头的将会禁用所有pre、normal类型的loader，剩余post和normal类型的。
 */
let loaders = [];
if (request.startsWith('!!')) {
  loaders.push(...inlineLoaders);
} else if (request.startsWith('-!')) {
  loaders.push(...postLoaders, ...inlineLoaders);
} else if (request.startsWith('!')) {
  loaders.push(...postLoaders, ...inlineLoaders, ...preLoaders);
} else {
  loaders.push(
    ...[...postLoaders, ...inlineLoaders, ...normalLoaders, ...preLoaders]
  );
}


// 将loader转化为loader所在文件的路径
// webpack默认是针对于配置中的resolveLoader的路径进行解析 模拟时省略了webpack的路径解析过程
const resolveLoader = (loader) => path.resolve(__dirname, './loaders', loader);
// 获取需要处理的loaders路径

loaders = loaders.map(resolveLoader);
runLoaders(
  {
    resource: filePath, // 加载的模块路径
    loaders, // 需要处理的loaders数组
    context: {
      name: '上下文对象',// 传递的上下文对象
    },
    readResource: fs.readFile.bind(fs),// 读取文件的方法
  },
  (error, result) => {
    console.log('存在的错误', error);
    console.log('结果', result);
  }
)