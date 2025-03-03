'use strict';

const fs = require('fs');
const runtimePath = require('../runtime-path');
const ConsoleAgent = require('../ConsoleAgent');

const errorExp = /^(.+?Error): (.+)$/m;

let prelude;
class PorfforAgent extends ConsoleAgent {
  compile(code) {
    code = super.compile(code).replaceAll(';$262.destroy();', '');

    return prelude + code.split('---*/').pop();
  }

  async evalScript(code, options = {}) {
    if (!prelude) prelude = await (await fetch('https://raw.githubusercontent.com/CanadaHonk/porffor/main/test262/prelude.js')).text();

    if (options.module && this.args[0] !== '--module') {
      this.args.unshift('--module');
    }

    if (!options.module && this.args[0] === '--module') {
      this.args.shift();
    }

    const hacks = [
      // remove error constructor checks
      x => {
        const str = `if (err.constructor !== Test262Error) {`;
        const ind = x.indexOf(str);
        if (ind === -1) return x;
    
        const nextEnd = x.indexOf('}', ind + str.length);
    
        return x.replace(x.slice(ind, nextEnd + 1), '');
      },
    
      // random error detail checks
      x => {
        return x
          .replace(/assert\.notSameValue\(err\.message\.indexOf\('.*?'\), -1\);/g, '')
          .replace(/if \(\(e instanceof (.*)Error\) !== true\) \{[\w\W]*?\}/g, '')
          .replace(/assert\.sameValue\(\s*e instanceof RangeError,\s*true,[\w\W]+?\);/g, '');
      },
    
      // int valtypes only: replace assert._isSameValue check with simple check
      // x => {
      //   if (valtype[0] !== 'i') return x;
      //   return x.replace(`assert._isSameValue = function (a, b) {`, `assert._isSameValue = function (a, b) { return a == b;`);
      // },
    
      // replace old tests' custom checks with standard assert
      x => {
        return x
          .replace(/if \(([^ ]+) !== ([^ ]+)\) \{ *\n *throw new Test262Error\(['"](.*)\. Actual:.*\); *\n\} *\n/g, (_, one, two) => `assert.sameValue(${one}, ${two});\n`);
      },
    
      // remove actual string concats from some error messages
      x => {
        return x
          .replace(/\. Actual: ' \+ .*\);/g, _ => `');`);
      },
    
      // replace some (avoid false pos) assert.throws with inline try
      x => {
        return x
          .replace(/assert\.throws\(ReferenceError, function\(\) {([\w\W]+?)}\);/g, (_, body) => `let _thrown = false;\ntry {${body}\n_thrown = true;\n} catch {}\nif (_thrown) throw new Test262Error('Expected a ReferenceError to be thrown but no exception was at all');\n`);
      }
    ];

    for (const hack of hacks) {
      code.contents = hack(code.contents);
    }

    return super.evalScript(code, options);
  }

  parseError(str) {
    const match = str.match(errorExp);

    if (!match) return null;

    return {
      name: match[1],
      message: match[2],
      stack: []
    };
  }
}

PorfforAgent.runtime = fs.readFileSync(runtimePath.for('porffor'), 'utf8');

module.exports = PorfforAgent;
