import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline/promises';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, NonceManager, parseEther, formatEther } from 'ethers';

const sepolia = process.argv.includes('--sepolia');
if (sepolia && !process.env.SEPOLIA_RPC_URL) throw Error('Set SEPOLIA_RPC_URL in .env');
if (sepolia && !/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || '')) throw Error('Set PRIVATE_KEY of your Sepolia test wallet in .env');
const provider = new JsonRpcProvider(sepolia ? process.env.SEPOLIA_RPC_URL : 'http://127.0.0.1:8546', undefined, { cacheTimeout: -1 });
const routerAddress = sepolia ? '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3' : '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const network = await provider.getNetwork();
assert.equal(network.chainId, sepolia ? 11155111n : 31337n, 'RPC has the wrong chainId');
let forkBlock = null;
if (!sepolia) {
  const metadata = await provider.send('hardhat_metadata', []);
  assert.ok(metadata.forkedNetwork, 'This must be a fork, not an empty local chain');
  assert.equal(BigInt(metadata.forkedNetwork.chainId), 1n, 'Fork Ethereum mainnet');
  forkBlock = metadata.forkedNetwork.forkBlockNumber;
  // Execute calls on a new local block rather than on the historical fork block.
  await provider.send('evm_mine', []);
}
const signer = sepolia ? new NonceManager(new Wallet(process.env.PRIVATE_KEY, provider)) : await provider.getSigner(0);
const user = await signer.getAddress();
if (sepolia) assert.ok(await provider.getBalance(user) > 0n, 'Your test wallet needs Sepolia ETH for gas');
assert.notEqual(await provider.getCode(routerAddress), '0x', 'Uniswap Router must exist');

const router = new Contract(routerAddress, [
  'function factory() view returns(address)',
  'function getAmountsOut(uint256,address[]) view returns(uint256[])'
], signer);
const factoryAddress = await router.factory();
assert.equal(factoryAddress.toLowerCase(), sepolia ? '0xf62c03e08ada871a0beb309762e260a7a6a880e6' : '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f');
const factory = new Contract(factoryAddress, ['function getPair(address,address) view returns(address)'], provider);
fs.mkdirSync('results', { recursive: true });
const result = { network: sepolia ? 'Sepolia' : 'Hardhat Local Fork of Ethereum Mainnet', chainId: Number(network.chainId), forkBlock, user, router: routerAddress, factory: factoryAddress, stages: [] };
const interactive = process.argv.includes('--step-by-step') ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const stage = async (number, title, data) => {
  result.stages.push({ number, title, data });
  fs.writeFileSync('results/run.json', JSON.stringify(result, null, 2));
  console.log(`\nSTEP ${number}: ${title}`);
  for (const [key, value] of Object.entries(data)) console.log(`${key}: ${value}`);
  if (interactive && number < 6) await interactive.question('\nЗроби скриншот цього етапу. Натисни Enter, щоб перейти до наступного...');
};
await stage(1, sepolia ? 'Підключення до Sepolia та Uniswap V2' : 'Перевірка локального форку та Uniswap V2', {
  RPC: sepolia ? 'Sepolia RPC (URL приховано)' : 'http://127.0.0.1:8546', chainId: result.chainId,
  ...(sepolia ? { 'Гаманець': user, 'Баланс Sepolia ETH': formatEther(await provider.getBalance(user)) } : { forkBlock }),
  Router: routerAddress, Factory: factoryAddress, 'Код Router': 'Перевірено',
  'Компіляція': JSON.parse(fs.readFileSync('artifacts/compilation.json')).compiler
});
const artifact = name => JSON.parse(fs.readFileSync(`artifacts/${name}.json`));
async function deploy(name, args) {
  const a = artifact(name);
  const contract = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}
async function sent(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  assert.equal(receipt.status, 1);
  return { hash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}
const a = await deploy('AssetToken', ['Vadim Token A', 'VTA', parseEther('100000')]);
const b = await deploy('AssetToken', ['Vadim Token B', 'VTB', parseEther('100000')]);
const aAddr = await a.getAddress(), bAddr = await b.getAddress();
const integrator = await deploy('DefiIntegrator', [routerAddress]);
const iAddr = await integrator.getAddress();
result.tokenA = aAddr; result.tokenB = bAddr; result.integrator = iAddr;
await stage(2, 'Емісія токенів та розгортання інтегратора', {
  TokenA: aAddr, TokenB: bAddr, DefiIntegrator: iAddr,
  'Емісія VTA': formatEther(await a.totalSupply()), 'Емісія VTB': formatEther(await b.totalSupply()),
  'Router інтегратора': await integrator.router(),
  'Транзакція VTA': a.deploymentTransaction().hash,
  'Транзакція VTB': b.deploymentTransaction().hash,
  'Транзакція інтегратора': integrator.deploymentTransaction().hash
});

// Step 3: approve exactly what provideLiquidity needs.
const approveA = await sent(a.approve(iAddr, parseEther('1000')));
const approveB = await sent(b.approve(iAddr, parseEther('2000')));
await stage(3, 'Дозволи approve для DefiIntegrator', {
  'allowance VTA': formatEther(await a.allowance(user, iAddr)),
  'allowance VTB': formatEther(await b.allowance(user, iAddr)),
  'approve VTA tx': approveA.hash, 'approve VTB tx': approveB.hash,
  'Отримувач дозволів': iAddr
});
const deadline = async () => (await provider.getBlock('latest')).timestamp + 600;
const liquidityTx = await sent(integrator.provideLiquidity(
  aAddr, bAddr, parseEther('1000'), parseEther('2000'),
  parseEther('990'), parseEther('1980'), await deadline()
));
const pairAddress = await factory.getPair(aAddr, bAddr);
assert.notEqual(pairAddress, '0x0000000000000000000000000000000000000000');
result.pair = pairAddress;
const pair = new Contract(pairAddress, [
  'function token0() view returns(address)', 'function getReserves() view returns(uint112,uint112,uint32)',
  'function balanceOf(address) view returns(uint256)'
], provider);
const aIs0 = (await pair.token0()).toLowerCase() === aAddr.toLowerCase();
async function reserves() {
  const r = await pair.getReserves();
  return aIs0 ? [r[0], r[1]] : [r[1], r[0]];
}
const before = await reserves();
assert.equal(before[0], parseEther('1000')); assert.equal(before[1], parseEther('2000'));
assert.ok(await pair.balanceOf(user) > 0n);
await stage(4, 'Створення пулу через provideLiquidity', {
  Pair: pairAddress, 'Резерв VTA': formatEther(before[0]), 'Резерв VTB': formatEther(before[1]),
  'LP токени користувача': formatEther(await pair.balanceOf(user)),
  'Баланс VTA користувача': formatEther(await a.balanceOf(user)),
  'Баланс VTB користувача': formatEther(await b.balanceOf(user)),
  'Транзакція': liquidityTx.hash, 'Блок': liquidityTx.block, 'Gas used': liquidityTx.gasUsed
});

const amountIn = parseEther('10');
// New approve right before the swap (the previous allowance was spent by provideLiquidity).
const approveSwap = await sent(a.approve(iAddr, amountIn));
assert.equal(await a.allowance(user, iAddr), amountIn);
const quote = (await router.getAmountsOut(amountIn, [aAddr, bAddr]))[1];
const minOut = quote * 99n / 100n;
const balanceABefore = await a.balanceOf(user), balanceBBefore = await b.balanceOf(user);
// Dry run first: shows the real revert reason before spending gas.
await integrator.swapTokens.staticCall(aAddr, bAddr, amountIn, minOut, await deadline());
const swapTx = await sent(integrator.swapTokens(aAddr, bAddr, amountIn, minOut, await deadline()));
const balanceAAfter = await a.balanceOf(user), balanceBAfter = await b.balanceOf(user);
const received = balanceBAfter - balanceBBefore;
assert.equal(balanceABefore - balanceAAfter, amountIn);
assert.equal(received, quote); assert.ok(received >= minOut);
const after = await reserves();
await stage(5, 'Обмін 10 VTA на VTB через swapTokens', {
  'approve VTA tx (перед обміном)': approveSwap.hash,
  'Вхід VTA': '10', 'Очікувано VTB': formatEther(quote), 'amountOutMin VTB': formatEther(minOut),
  'Отримано VTB': formatEther(received), 'Допустиме проковзування': '1%',
  'Баланс VTA після': formatEther(balanceAAfter), 'Баланс VTB після': formatEther(balanceBAfter),
  'Резерв VTA після': formatEther(after[0]), 'Резерв VTB після': formatEther(after[1]),
  'Транзакція': swapTx.hash, 'Блок': swapTx.block, 'Gas used': swapTx.gasUsed
});
assert.equal(await a.balanceOf(iAddr), 0n); assert.equal(await b.balanceOf(iAddr), 0n);
assert.equal(await a.allowance(iAddr, routerAddress), 0n); assert.equal(await b.allowance(iAddr, routerAddress), 0n);
assert.equal(after[0] - before[0], amountIn); assert.equal(before[1] - after[1], received);
// Check slippage and deadline protections without changing blockchain state.
await sent(a.approve(iAddr, amountIn));
const nextQuote = (await router.getAmountsOut(amountIn, [aAddr, bAddr]))[1];
await assert.rejects(integrator.swapTokens.staticCall(aAddr, bAddr, amountIn, nextQuote + 1n, await deadline()));
await assert.rejects(integrator.swapTokens.staticCall(aAddr, bAddr, amountIn, 1n, (await provider.getBlock('latest')).timestamp - 1));
await sent(a.approve(iAddr, 0));
await stage(6, 'Перевірка результатів та захисту', {
  'approve → provideLiquidity → approve → swapTokens': 'PASS',
  'Зменшення VTA та збільшення VTB': 'PASS', 'LP отримав користувач': 'PASS',
  'Токени не залишились в інтеграторі': 'PASS', 'Дозволи інтегратора для Router очищені': 'PASS',
  'Завищений amountOutMin відхилено': 'PASS', 'Прострочений deadline відхилено': 'PASS'
});
console.log('\nResults saved to results/run.json');
interactive?.close();
provider.destroy();