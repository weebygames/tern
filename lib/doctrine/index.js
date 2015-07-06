
(function(root, mod) {
  if (typeof define == "function" && define.amd) // AMD
    return define(["exports", "./doctrine", "./esutils_code", "./typed", "./utility"], mod);
  mod(root.doctrine, doctrine);
})(this, function(exports, doctrine) {
  exports.doctrine = doctrine;
});
