import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const sources = Object.fromEntries(['AssetToken', 'DefiIntegrator'].map(name => [
  `${name}.sol`, { content: fs.readFileSync(`contracts/${name}.sol`, 'utf8') }
]));
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
for (const error of output.errors || []) console.log(error.formattedMessage);
if (output.errors?.some(error => error.severity === 'error')) process.exit(1);
fs.mkdirSync('artifacts', { recursive: true });
for (const name of ['AssetToken', 'DefiIntegrator']) {
  const contract = output.contracts[`${name}.sol`][name];
  fs.writeFileSync(`artifacts/${name}.json`, JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2));
  console.log(`OK ${name}: ${contract.evm.bytecode.object.length / 2} bytes`);
}
fs.writeFileSync('artifacts/compilation.json', JSON.stringify({ compiler: solc.version(), contracts: ['AssetToken', 'DefiIntegrator'], success: true }, null, 2));