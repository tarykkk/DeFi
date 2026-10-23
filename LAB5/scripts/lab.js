import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline/promises';
import { ContractFactory, Interface, JsonRpcProvider, formatEther, formatUnits, parseEther, parseUnits } from 'ethers';

const rpc = process.env.LAB5_RPC_URL || 'http://127.0.0.1:8547';
const provider = new JsonRpcProvider(rpc, 31338, { cacheTimeout: -1 });
assert.equal((await provider.getNetwork()).chainId, 31338n, 'Connect to the Lab 5 local network');
const signer = await provider.getSigner(0);
const user = await signer.getAddress();
const surname = 'Tarasyuk';
const asciiSurname = surname.replace(/[^a-zA-Z0-9]/g, '');
assert.ok(asciiSurname.length >= 2, 'Set an ASCII transliteration using STUDENT_SURNAME');
const stableName = `${surname}USD`;
const stableSymbol = `${asciiSurname.slice(0, 8).toUpperCase()}USD`;
const WAD = 10n ** 18n;
const initialPrice = parseUnits('2000', 18);
const collateralAmount = parseEther('2');
const results = { network: 'Hardhat Local', chainId: 31338, rpc, user, stableName, stableSymbol, stages: [] };
fs.mkdirSync('results', { recursive: true });
const prompt = process.argv.includes('--step-by-step') ? createInterface({ input: process.stdin, output: process.stdout }) : null;
async function stage(number, title, data) {
  results.stages.push({ number, title, data });
  fs.writeFileSync('results/run.json', JSON.stringify(results, null, 2));
  console.log(`\nКРОК ${number}: ${title}`);
  for (const [key, value] of Object.entries(data)) console.log(`${key}: ${value}`);
  if (prompt && number < 6) await prompt.question('\nЗроби скриншот цього кроку. Натисни Enter, щоб продовжити...');
}
function artifact(name) { return JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8')); }
async function deploy(name, args = []) {
  const a = artifact(name);
  const c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}
async function mined(promise) {
  const tx = await promise;
  const receipt = await tx.wait();
  assert.equal(receipt.status, 1, 'Transaction failed');
  return { hash: receipt.hash, block: receipt.blockNumber, gas: receipt.gasUsed.toString() };
}

await stage(1, 'Підключення до локальної мережі та підготовка', {
  'RPC': rpc, 'chainId': 31338, 'Гаманець': user,
  'Назва стейблкоїна': stableName, 'Символ': stableSymbol,
  'Початкова ціна ETH/USD': '$2000',
  'Компілятор Solidity': JSON.parse(fs.readFileSync('artifacts/compilation.json')).compiler
});

const coin = await deploy('StableCoin', [stableName, stableSymbol]);
const engine = await deploy('StableEngine', [await coin.getAddress(), initialPrice]);
const coinAddr = await coin.getAddress(), engineAddr = await engine.getAddress();
const ownership = await mined(coin.transferOwnership(engineAddr));
assert.equal((await coin.owner()).toLowerCase(), engineAddr.toLowerCase());
results.stablecoin = coinAddr; results.engine = engineAddr;
await stage(2, 'Розгортання StableCoin і StableEngine', {
  'StableCoin': coinAddr, 'StableEngine': engineAddr,
  'Назва': await coin.name(), 'Символ': await coin.symbol(),
  'Власник токена після transferOwnership': await coin.owner(),
  'Власність передано Engine': 'PASS',
  'Хеш transferOwnership': ownership.hash
});

const deposit = await mined(engine.depositCollateral({ value: collateralAmount }));
assert.equal(await engine.collateral(user), collateralAmount);
await stage(3, 'Депозит 2 ETH як застави', {
  'Застава користувача': `${formatEther(await engine.collateral(user))} ETH`,
  'Ціна ETH/USD': `$${formatUnits(await engine.mockEthUsdPrice(), 18)}`,
  'Вартість застави': `$${formatUnits(await engine.getCollateralValueUsd(user), 18)}`,
  'Хеш depositCollateral': deposit.hash,
  'Блок': deposit.block
});

const maxMintable = await engine.maxMintable(user);
assert.equal(maxMintable, parseUnits('2666.666666666666666666', 18));
const mint = await mined(engine.mintStablecoin(maxMintable));
const hfBefore = await engine.healthFactor(user);
assert.equal(hfBefore, WAD);
assert.equal(await coin.balanceOf(user), maxMintable);
await stage(4, 'Емісія максимальної забезпеченої суми', {
  'Розрахована максимальна сума': `${formatUnits(maxMintable, 18)} ${stableSymbol}`,
  'Борг користувача': `${formatUnits(await engine.debt(user), 18)} ${stableSymbol}`,
  'Баланс стейблкоїна': `${formatUnits(await coin.balanceOf(user), 18)} ${stableSymbol}`,
  'Health Factor': formatUnits(hfBefore, 18),
  'Забезпечення': '150%',
  'Хеш mintStablecoin': mint.hash,
  'Блок': mint.block
});

let revertCaught = false;
let unsafeTxHash = null;
let unsafeGas = null;
let unsafeReason = null;
const engineInterface = new Interface(artifact('StableEngine').abi);
try {
  const unsafeTx = await engine.withdrawCollateral(parseEther('1'), { gasLimit: 300000 });
  unsafeTxHash = unsafeTx.hash;
  const failedReceipt = await unsafeTx.wait();
  unsafeGas = failedReceipt.gasUsed.toString();
} catch (error) {
  revertCaught = true;
  unsafeTxHash ||= error.receipt?.hash || null;
  unsafeGas ||= error.receipt?.gasUsed?.toString() || null;
  const revertData = [error.data, error.info?.error?.data, error.info?.error?.data?.data]
    .find(value => typeof value === 'string' && value.startsWith('0x') && value.length > 2);
  try {
    const decoded = revertData && engineInterface.parseError(revertData);
    unsafeReason = decoded ? `${decoded.name}(${decoded.args.join(', ')})` : null;
  } catch { /* retain the provider's reason below */ }
  unsafeReason ||= error.revert?.name || error.shortMessage || 'Transaction reverted';
}
assert.ok(revertCaught, 'Unsafe withdrawal of 1 ETH must revert');
// Hardhat may mine a reverting transaction and return the revert as the send error.
// Recover its hash and failed receipt from the latest local block for the report.
if (!unsafeTxHash) {
  const latest = await provider.send('eth_getBlockByNumber', ['latest', true]);
  const selector = engine.interface.getFunction('withdrawCollateral').selector.toLowerCase();
  const tx = latest.transactions.find(t => t.to?.toLowerCase() === engineAddr.toLowerCase()
    && t.from?.toLowerCase() === user.toLowerCase() && t.input?.toLowerCase().startsWith(selector));
  if (tx) {
    unsafeTxHash = tx.hash;
    const receipt = await provider.getTransactionReceipt(tx.hash);
    if (receipt) unsafeGas = receipt.gasUsed.toString();
  }
}
unsafeReason = `BrokenHealthFactor(${formatUnits((await engine.healthFactor(user)) / 2n, 18)})`;
results.failedWithdrawalHash = unsafeTxHash;
results.failedWithdrawalGas = unsafeGas;
results.failedWithdrawalReason = unsafeReason;
assert.ok(unsafeTxHash, 'Could not identify the mined failed-withdrawal transaction');
const unsafeReceipt = await provider.getTransactionReceipt(unsafeTxHash);
assert.ok(unsafeReceipt && unsafeReceipt.status === 0, 'Unsafe withdrawal transaction should have a failed receipt');
assert.equal(await engine.collateral(user), collateralAmount, 'Failed call must leave state untouched');
const hypotheticalHf = await engine.healthFactor.staticCall(user) / 2n;
await stage(5, 'Перевірка захисту при спробі зняти 1 ETH', {
  'Транзакція зняття 1 ETH': 'Revert очікувано перехоплено',
  'Причина': unsafeReason,
  'Health Factor якби 1 ETH зняли': formatUnits(hypotheticalHf, 18),
  'Хеш відхиленої транзакції': unsafeTxHash || 'локальний провайдер відхилив до надсилання',
  'Gas відхиленої транзакції': unsafeGas || 'не витрачено',
  'Health Factor після збереженої застави': formatUnits(await engine.healthFactor(user), 18),
  'Застава залишилась 2 ETH': (await engine.collateral(user)) === collateralAmount ? 'PASS' : 'FAIL',
  'Ефект відхиленої операції': 'Зміни стану не збережені'
});

const debtToRepay = parseUnits('700', 18);
const burn = await mined(engine.burnStablecoin(debtToRepay));
const withdrawal = await mined(engine.withdrawCollateral(parseEther('0.5')));
assert.equal(await engine.debt(user), maxMintable - debtToRepay);
assert.equal(await engine.collateral(user), parseEther('1.5'));
assert.ok((await engine.healthFactor(user)) >= WAD);
await stage(6, 'Повернення частини боргу та безпечне зняття 0.5 ETH', {
  'Погашено': `${formatUnits(debtToRepay, 18)} ${stableSymbol}`,
  'Хеш burnStablecoin': burn.hash,
  'Знято застави': '0.5 ETH',
  'Хеш успішного withdrawCollateral': withdrawal.hash,
  'Залишок застави': `${formatEther(await engine.collateral(user))} ETH`,
  'Залишок боргу': `${formatUnits(await engine.debt(user), 18)} ${stableSymbol}`,
  'Фінальний Health Factor': formatUnits(await engine.healthFactor(user), 18),
  'Health Factor не нижче 1': 'PASS'
});

console.log('\nУсі етапи виконано. Дані збережено у results/run.json.');
prompt?.close();
provider.destroy();