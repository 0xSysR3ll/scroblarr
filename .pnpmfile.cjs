function readPackage(pkg) {
  if (pkg.name === 'sqlite3') {
    pkg.scripts = pkg.scripts || {};
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
