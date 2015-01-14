
/**
 * Expose `HTMLCov`.
 */

exports = module.exports = HTMLCov;

var fs = require('fs');
var path = require('path');
var sourcemap = require('source-map');

/**
 * Initialize a new HTMLCov reporter.
 * File format of HTMLCov can be found here: http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
 *
 * @param {Runner} runner
 * @api public
 */

function HTMLCov(runner) {
  runner.on('end', function(){
    var cov = global._$jscoverage || {};
    var new_cov = {};

    for (var filename in cov) {
      var data = cov[filename];
      var map_cov = explodeData(filename, data);
      for (var map_filename in map_cov){
        if (new_cov.hasOwnProperty(map_filename) === false){
          new_cov[map_filename] = map_cov[map_filename];
        } else {
          // assuming source is the same otherwise there is a problem...
          //new_cov[map_filename].source = map_cov[map_filename].source;
          map_cov[map_filename].forEach(function(line,num){
            if (map_cov[map_filename][num] !== undefined) {
              if (new_cov[map_filename][num] === 0 && map_cov[map_filename][num] > 0){
                new_cov[map_filename][num] = 1;
              }
            }
          });
        }
      }
    }

    var jade = require('jade')
      , file = __dirname + '/templates/coverage.jade'
      , str = fs.readFileSync(file, 'utf8')
      , fn = jade.compile(str, { filename: file });

    var json_cov = map(new_cov);
    process.stdout.write(fn({
      cov: json_cov,
      coverageClass: coverageClass
    }));
  });
}

function explodeData(filename, data) {
  var sourcemap_filename = null;
  var sourcemap_data = null;
  var sourcemap_consumer = null;
  var coverage_data = null;

  // getting loaded source code (guessing it is the generated/augemented one)
  var generated_code = fs.readFileSync(filename).toString();

  // checking whether there is the sourcemap URL hardcoded inside the code
  var sourcemap_ref_regexp = /\/\/\#\s*sourceMappingURL\=(.*?)(?=\n|$)/gi;
  var sourcemap_ref_result = sourcemap_ref_regexp.exec(generated_code);
  if (sourcemap_ref_result != null && sourcemap_ref_result.length === 2) {
    // getting the hardcoded sourcemap file name and resolving it against source file path
    sourcemap_filename = path.resolve(path.dirname(filename),sourcemap_ref_result[1]);
    // loading the file if exists otherwise we unset the sourcemap_filename variable to enable further checks
    if (fs.existsSync(sourcemap_filename) === true) {
      sourcemap_data = fs.readFileSync(sourcemap_filename).toString();
    } else {
      sourcemap_filename == null;
    }
  }
  // if not yet found, checking whether the sourcemap file exists in the same folder
  if (sourcemap_filename == null){
    sourcemap_filename = filename+'.map';
    if (fs.existsSync(sourcemap_filename) === true) {
      sourcemap_data = fs.readFileSync(sourcemap_filename).toString();
    } else {
      sourcemap_filename == null;
    }
  }

  // creating instance of SourceMapConsumer with sourcemap file data if any
  if (sourcemap_data != null) {
    sourcemap_consumer = new sourcemap.SourceMapConsumer(sourcemap_data);

    coverage_data = {};
    //process.stdout.write('working on ' + filename + '\n');
    //process.stdout.write('lines: ' + data.source.length + '\n');
    data.source.forEach(function(line, num) {
      num++;
      if (data[num] !== undefined) {
        var skip_white_chars = (/^\s*/gi).exec(line);
        if (skip_white_chars == null) {
          skip_white_chars = 0;
        } else {
          skip_white_chars = skip_white_chars[0].length;
        }
        var original_position = sourcemap_consumer.originalPositionFor({ line: num, column: skip_white_chars+1 });
        var original_filename = null;
        var original_num = null;
        if (original_position.line != null){
          //process.stdout.write('line ' + num + ' were in ' + original_position.source + ' at ' + original_position.line + '\n');
          original_filename = original_position.source.replace(/^file\:\/\//gi,'');
          original_num = original_position.line;
          coverage_data[original_filename]=coverage_data[original_filename]||[];
          if (coverage_data[original_filename].hasOwnProperty('source') === false && fs.existsSync(original_filename) === true){
            coverage_data[original_filename].source = fs.readFileSync(original_filename).toString().split('\n');
          }
          if (coverage_data[original_filename][original_num] !== undefined) {
            if (coverage_data[original_filename][original_num] === 0 && data[num] > 0){
              coverage_data[original_filename][original_num] = 1;
            }
          } else {
            coverage_data[original_filename][original_num] = (data[num] > 0) ? 1 : 0;
          }

        } else {
          //process.stdout.write('line ' + num + ' didn\'t exist' + '\n');
        }
      }
    });

    return coverage_data
  } else {
    var result = {};
    result[filename] = data;
    return result;
  }
}

/**
 * Return coverage class for `n`.
 *
 * @return {String}
 * @api private
 */

function coverageClass(n) {
  if (n >= 75) return 'high';
  if (n >= 50) return 'medium';
  if (n >= 25) return 'low';
  return 'terrible';
}

/**
 * Map jscoverage data to a JSON structure
 * suitable for reporting.
 *
 * @param {Object} cov
 * @return {Object}
 * @api private
 */

function map(cov) {
  var ret = {
    instrumentation: 'node-jscoverage'
    , sloc: 0
    , hits: 0
    , misses: 0
    , coverage: 0
    , files: []
  };

  for (var filename in cov) {
    var data = coverage(filename, cov[filename]);
    ret.files.push(data);
    ret.hits += data.hits;
    ret.misses += data.misses;
    ret.sloc += data.sloc;
  }

  ret.files.sort(function(a, b) {
    return a.filename.localeCompare(b.filename);
  });

  if (ret.sloc > 0) {
    ret.coverage = (ret.hits / ret.sloc) * 100;
  }

  return ret;
}

/**
 * Map jscoverage data for a single source file
 * to a JSON structure suitable for reporting.
 *
 * @param {String} filename name of the source file
 * @param {Object} data jscoverage coverage data
 * @return {Object}
 * @api private
 */

function coverage(filename, data) {
  var ret = {
    filename: filename,
    coverage: 0,
    hits: 0,
    misses: 0,
    sloc: 0,
    source: {}
  };

  data.source.forEach(function(line, num){
    num++;

    if (data[num] === 0) {
      ret.misses++;
      ret.sloc++;
    } else if (data[num] !== undefined) {
      ret.hits++;
      ret.sloc++;
    }

    ret.source[num] = {
      source: line
      , coverage: data[num] === undefined
        ? ''
        : data[num]
    };
  });

  ret.coverage = ret.hits / ret.sloc * 100;

  return ret;
}
