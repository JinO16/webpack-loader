// 每一个loader文件夹都存在对应的normal loader 和pitch loader
// 上一个loader传入的解析后的源文件，如果是第一个loader，则为源文件
function loader(source) {
  // console.log('inline1： normal', source);
  return source + '//inline1';
}

loader.pitch = function () {
  // console.log('inline1 pitch');
}
loader.raw = true;

module.exports = loader;