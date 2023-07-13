// 每一个loader文件夹都存在对应的normal loader 和pitch loader
function loader(source) {
  // console.log('inline1： normal', source);
  return source + '//post1';
}

loader.pitch = function () {
  // console.log('inline1 pitch');
}
loader.raw = true;

module.exports = loader;