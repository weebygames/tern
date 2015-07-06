// Parses comments above variable declarations, function declarations,
// and object properties as docstrings and JSDoc-style type
// annotations.

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/tern"), require("../lib/doctrine"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern", "../lib/doctrine/index"], mod);
  mod(tern, doctrine);
})(function(infer, tern, doctrine) {
  "use strict";

  var WG_MADEUP = 1, WG_STRONG = 101;
  var doctrineObj = {};

  tern.registerPlugin("all_jsdoc", function(server, options) {
    server.doctrine = Object.create(null);
    server.on("reset", function() {
      server.doctrine = Object.create(null);
    });
    server._doctrine = doctrineObj = {
      // weight: options && options.strong ? WG_STRONG : undefined,
      // fullDocs: options && options.fullDocs
      server: server,
      jsdocs: {},
      flatDocs: {}
    };

    return {
      passes: {
        postParse: postParse,
        postInfer: postInfer,
        variableCompletion: variableCompletion,
        memberCompletion: memberCompletion
      }
    };
  });

  var Word = function(file, wordStart, wordEnd) {
    this.file = file;
    this.wordStart = wordStart;
    this.wordEnd = wordEnd;
  }

  /**
   * Get the word before this word
   * @method wordBefore
   * @return {Word|null}
   */
  Word.prototype.wordBefore = function() {
    var fileContents = this.file.text;
    var end = this.wordStart - 1;
    // The char before must be a dot
    if (fileContents.charCodeAt(end) !== 46) {
      return null;
    }

    var start = end - 1;

    // Max length of 100
    for (var i = 0; start >= 0 && i < 100; i++) {
      var code = fileContents.charCodeAt(start);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        start--;
        continue;
      } else {
        break;
      }
    }

    if (i > 0) {
      return new Word(this.file, start, end);
    }
    return null;
  }

  Word.prototype.toString = function() {
    return this.file.text.substring(this.wordStart, this.wordEnd).trim();
  }

  function mixedCompletion(file, wordStart, wordEnd, gather) {
    var word = new Word(file, wordStart, wordEnd);
    var words = [word];

    // Grab all the words beforehand
    for (var i = 0; i < 5; i++) {
      var before = words[0].wordBefore();
      if (before) {
        words.unshift(before);
      } else {
        break;
      }
    }

    if (!words.length) { return; }

    // Try to make the lookup
    var guesses = getFlatDocs(words.join('.'));
    if (!guesses || !guesses.length) { return; }

    // return!
    guesses.forEach(function(guess) {
      gather(guess['!name'], null, 0, function(rec) {
        // rec.depth
        rec.type = infer.toString(guess['!type']);
        rec.doc = guess['!doc'];
        // rec.url
        // rec.origin = 'scene';
        rec.guess = false;
      });
    });
  }

  function variableCompletion(file, wordStart, wordEnd, gather) {
    var wordInst = new Word(file, wordStart, wordEnd);
    var word = wordInst.toString();

    var lookup = doctrineObj.jsdocs;
    Object.keys(lookup).forEach(function(key) {
      if (word.length === 0 || key.indexOf(word) === 0) {
        var value = lookup[key];
        gather(key, null, 0, function(rec) {
          // rec.depth
          rec.type = value['!type'];
          rec.doc = value['!doc'];
          // rec.url
          // rec.origin = 'scene';
          rec.guess = false;
        });
      }
    });

    // gather: prop, obj, depth, addInfo
    // gather(kw, null, 0, function(rec) { rec.isKeyword = true; });
  }

  function memberCompletion(file, wordStart, wordEnd, gather) {
    mixedCompletion(file, wordStart, wordEnd, gather);
  }

  function postParse(ast, text) {
    // Run doctrine
    // console.log(ast.sourceFile.name);

    var x = doctrine.doctrine;
    var y = tern;
    var z = infer;
    var xx = doctrineObj.server;
    var re = /\/\*(\*(?!\/)|[^*])*\*\//gm;

    var match;
    while ((match = re.exec(text)) !== null) {
      var comment = match[0];
      if (comment.length <= 4) continue;

      var res = x.parse(comment, { unwrap: true });
      addJSDoc(res);
    }
  }

  function addJSDoc(jsdoc) {
    var def = jsdocToDef(jsdoc);

    if (def.__private) return;
    if (!def.__name) { return; }

    recursiveAdd(def.__name, def);
  }

  /**
   * Destructive, in place, merge of b into a
   * @method merge
   * @param  {object} a
   * @param  {object} b
   */
  function merge(a, b) {
    Object.keys(b).forEach(function(keyB) {
      a[keyB] = b[keyB];
    });
    return a;
  }

  function addFlatDocs(path, def, parentDef) {
    var existing = doctrineObj.flatDocs[path];
    if (!existing) {
      doctrineObj.flatDocs[path] = {
        path: path,
        def: def,
        parent: parentDef
      };
    } else {
      console.log('jsdoc collision (old, new)', path, existing, def);
    }
  }

  function getFlatDocs(name) {
    var res = [];
    var docs = doctrineObj.flatDocs;

    for (var key in docs) {
      if (key.indexOf(name) === 0) {
        var doc = docs[key];
        res.push(doc.def);
      }

      if (res.length > 100) break;
    }

    return res;
  }

  function recursiveAdd(path, def, depth, defParent) {
    if (depth > 10) throw new Error('Max depth exceeded', path, def);

    if (typeof path === 'string') {
      path = path.split(/\#|\./);
    }

    // defaults
    depth = depth || 0;
    defParent = defParent || doctrineObj.jsdocs;

    var currentLevel = path[depth];

    // Is this the last path
    if (depth === path.length - 1) {
      // Add the def and return

      // Strip all __ items (for storage sake)
      for (var key in def) {
        if (key.indexOf('__') === 0) {
          delete def[key];
        }
      }

      var existingDef = defParent[currentLevel];
      if (existingDef) {
        merge(existingDef, def);
      } else {
        defParent[currentLevel] = def;
      }

      // Add a name if there isnt one already
      if (!def['!name']) {
        def['!name'] = currentLevel;
      }

      // TODO: this does not preserve # in paths. eg Class#instanceVar
      addFlatDocs(path.join('.'), def, defParent);
      return;
    } else {
      // Not there yet, go deeper

      // Make sure that the next level exists
      if (!defParent[currentLevel]) {
        // TODO: is this a proper placeholder?
        defParent[currentLevel] = {};
      }

      return recursiveAdd(path, def, depth + 1, defParent[currentLevel]);
    }
  }

  function jsdocToDef(jsdoc) {
    var res = {};
    if (jsdoc.description) {
      res['!doc'] = jsdoc.description;
    }

    var builtinTypes = ['function', 'object', 'number', 'string', '?'];
    var typeMap = { 'function': 'fn()', 'object': '{}' };
    var parseType = function(tagName) {
      var tagNameLower = tagName.toLowerCase();
      var lookup = typeMap[tagNameLower];
      if (builtinTypes.indexOf(tagNameLower) >= 0) {
        if (lookup) {
          return lookup;
        } else {
          return tagNameLower;
        }
      } else {
        return '+' + tagName;
      }
    }

    jsdoc.tags.forEach(function(tag) {
      if (tag.title === 'namespace') {
        res['!name'] = tag.name;
        res.__name = tag.name;
      }
      else if (tag.title === 'var') {
        res.__name = tag.name;

        // Type
        if (tag.type && tag.type.name) {
          res.__type = tag.type.name;
        }
      }
      else if (tag.title === 'private') {
        res.__private = true;
      }
      else if (tag.title === 'typedef') {
        // TODO: is this true?
        if (tag.name) {
          res.__name = tag.name;
          res.__type = tag.name;
          res.__extends = tag.type.name;
        } else {
          res.__type = tag.type.name;
        }
      }
      else if (tag.title === 'arg' || tag.title === 'argument' || tag.title === 'param') {
        if (!res.__params) {
          res.__params = [];
        }
        var tagType = tag.type;
        res.__params.push({
          name: tag.name || 'noname',
          type: (tagType && tagType.name) ? tagType.name : '?'
        });
      }
      else if (tag.title === 'func' || tag.title === 'function' || tag.title === 'method') {
        res.__type = 'function';
        res.__name = tag.name;
      }
      else if (tag.title === 'return' || tag.title === 'returns') {
        var tagType = tag.type;
        res.__return = {
          name: tag.name || 'result',
          type: (tagType && tagType.name) ? tagType.name : '?'
        };
      }
      else if (tag.title === 'property' || tag.title === 'prop') {
        // Remove the parent object's name
        var tagType = tag.type;
        if (!res.__props) { res.__props = []; }
        res.__props.push({
          name: tag.name,
          type: (tagType && tagType.name) ? tagType.name : '?',
          description: tag.description
        });
      }
    });

    // convert __type and __params to proper !type entry
    if (res.__type) {
      var tagNameLower = res.__type.toLowerCase();

      if (tagNameLower === 'function') {
        // special case for functions (need to add the params)
        var s = 'fn(';
        if (res.__params) {
          for (var i = 0, len = res.__params.length; i < len; i++) {
            var param = res.__params[i];

            // FIXME: handle object properties (will need a special case like functions)
            if (param.name.indexOf('.') > 0) continue;

            s += param.name + ': ' + parseType(param.type);
            if (i < len - 1) s += ', ';
          }
        }
        s += ')';

        if (res.__return) {
          s += ' -> ' + parseType(res.__return.type);
        }

        res['!type'] = s;
      }
      else if (tagNameLower === 'object') {
        // TODO: insert properties with their types
        res['!type'] = '{}';
      }
      else {
        res['!type'] = parseType(res.__type);
      }
    }

    if (res.__props) {
      res.__props.forEach(function(prop) {
        var def = {
          '!type': parseType(prop.type)
        };
        if (prop.description) { def['!desc'] = prop.description; }

        // Make sure to add it at the full path
        var fullPropName = prop.name;
        if (prop.name.indexOf(res.__name) < 0) {
          fullPropName = res.__name + '#' + prop.name;
        }
        recursiveAdd(fullPropName, def);
      });
    }

    return res;
  }

  function isDefinePropertyCall(node) {
    return node.callee.type == "MemberExpression" &&
      node.callee.object.name == "Object" &&
      node.callee.property.name == "defineProperty" &&
      node.arguments.length >= 3 &&
      typeof node.arguments[1].value == "string";
  }

  function postInfer(ast, scope) {
  }

  function interpretComments(node, comments, scope, aval, type) {
    debugger
  }

});
