import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const sources = Object.fromEntries(['StableCoin.sol', 'StableEngine.sol'].map(file => [file, {
  content: fs.readFileSync(path.join('contracts', file), 'utf8')
}]));
const input = {
  language: 'Solidity', sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input), {
  import: name => {
    const file = path.join('node_modules', name);
    return fs.existsSync(file) ? { contents: fs.readFileSync(file, 'utf8') } : { error: `Missing ${name}` };
  }
}));
for (const message of output.errors || []) console.log(message.formattedMessage);
if (output.errors?.some(message => message.severity === 'error')) process.exit(1);
fs.mkdirSync('artifacts', { recursive: true });
for (const name of ['StableCoin', 'StableEngine']) {
  const c = output.contracts[`${name}.sol`][name];
  fs.writeFileSync(`artifacts/${name}.json`, JSON.stringify({ abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }, null, 2));
  console.log(`OK ${name}: ${c.evm.bytecode.object.length / 2} bytes`);
}
fs.writeFileSync('artifacts/compilation.json', JSON.stringify({ compiler: solc.version(), success: true }, null, 2));