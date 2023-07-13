// 每一个loader文件夹都存在对应的normal loader 和pitch loader
function loader(source) {
  // console.log('inline1： normal', source);
  return source + '//normal2';
}

loader.pitch = function () {
  // console.log('inline1 pitch');
}
loader.raw = false;

module.exports = loader;