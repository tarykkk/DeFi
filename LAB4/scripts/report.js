import fs from 'node:fs';

const result = JSON.parse(fs.readFileSync('results/run.json', 'utf8'));
const sepolia = result.chainId === 11155111;
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const notes = [
  'Перевірено chainId 31337, наявність форку Ethereum і код офіційного Router Uniswap V2. Solidity контракти скомпільовано локально через solc.',
  'Створено два ERC-20 токени по 100 000 одиниць. Контракт DefiIntegrator отримав адресу Router через конструктор.',
  'Користувач дозволив інтегратору списати 1000 VTA та 2000 VTB для додавання ліквідності.',
  'Інтегратор передав 1000 VTA та 2000 VTB у Router. Factory створила нову пару; LP токени зараховано користувачу.',
  'Перед обміном користувач повторно дозволив інтегратору списати 10 VTA (попередній дозвіл витрачено при додаванні ліквідності). JavaScript отримав котирування від Router та обчислив amountOutMin із допуском 1%. Вихідні токени надійшли безпосередньо користувачу.',
  'Перевірено зміни балансів і резервів, отримання LP токенів та відсутність залишків у посередника. staticCall підтвердив відхилення завищеного мінімуму і простроченого deadline.'
];
const commands = ['npm.cmd install\nnpm.cmd run compile\nnpm.cmd run chain', 'npm.cmd run lab\n// deploy AssetToken × 2, DefiIntegrator', 'a.approve(integrator, parseEther("1000"))\nb.approve(integrator, parseEther("2000"))', 'integrator.provideLiquidity(\n  tokenA, tokenB, amountA, amountB, minA, minB, deadline\n)', 'a.approve(integrator, parseEther("10"))\nrouter.getAmountsOut(amountIn, [tokenA, tokenB])\nintegrator.swapTokens(tokenA, tokenB, amountIn, minOut, deadline)', 'assert.equal(received, quote)\nassert.equal(await token.balanceOf(integrator), 0n)\nassert.rejects(integrator.swapTokens.staticCall(...))'];
if (sepolia) {
  notes[0] = 'Перевірено мережу Ethereum Sepolia з chainId 11155111 і код офіційного Router Uniswap V2. Транзакції підписано тестовим гаманцем через ethers.';
  commands[0] = 'npm.cmd run check:sepolia\nnpm.cmd run compile\nnpm.cmd run lab:sepolia';
  commands[1] = 'npm.cmd run lab:sepolia\n// deploy AssetToken × 2, DefiIntegrator';
}
const environment = sepolia ? 'Sepolia · Uniswap V2' : 'Hardhat Local Fork · Uniswap V2';
const provenance = sepolia
  ? 'Фактичні результати scripts/lab.js із results/run.json. Транзакції виконано у Sepolia; хеші можна перевірити на sepolia.etherscan.io.<br>Ethereum Sepolia · chainId 11155111'
  : `Фактичні результати scripts/lab.js із results/run.json. Транзакції виконано локально; хеші не належать публічній мережі.<br>Форк Ethereum, блок ${result.forkBlock} · локальний chainId ${result.chainId}`;
const css = `*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#152235;font:17px 'Segoe UI',Arial,sans-serif}main{max-width:1120px;margin:28px auto;background:white;padding:34px 40px;border:1px solid #d9e0e8}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1f4d79;padding-bottom:18px;margin-bottom:24px}header b{font-size:20px}header span{font-size:14px;color:#56677a}h1{font-size:29px;margin:0 0 15px}p{line-height:1.5;margin:0 0 18px}pre{font:15px/1.45 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6f9;padding:16px;border-left:3px solid #437398}table{width:100%;border-collapse:collapse;margin:20px 0}td{border-bottom:1px solid #dee5ec;padding:11px 12px;vertical-align:top}td:first-child{width:28%;font-weight:600;color:#3b5066}td:last-child{font:15px/1.45 Consolas,monospace;overflow-wrap:anywhere}.pass{color:#168142;font-weight:bold}footer{color:#596b7b;font-size:13px;margin-top:22px}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}nav a{padding:7px 12px;background:#e5edf6;color:#1f4d79;text-decoration:none}body.capture nav{display:none}`;
fs.mkdirSync('results/pages', { recursive: true });
const nav = result.stages.map(s => `<a href="stage-${s.number}.html">Крок ${s.number}</a>`).join('');
for (const s of result.stages) {
  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Лабораторна 4 — Крок ${s.number}</title><style>${css}</style><body><main><header><b>Лабораторна робота 4 · JavaScript</b><span>${environment}</span></header><nav>${nav}</nav><h1>Крок ${s.number} — ${esc(s.title)}</h1><p>${esc(notes[s.number - 1])}</p><pre>${esc(commands[s.number - 1])}</pre><table>${Object.entries(s.data).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="${v === 'PASS' ? 'pass' : ''}">${esc(v)}</td></tr>`).join('')}</table><footer>${provenance}</footer></main><script>if(location.hash==='#capture')document.body.classList.add('capture')</script></body></html>`;
  fs.writeFileSync(`results/pages/stage-${s.number}.html`, html);
}
fs.writeFileSync('results/index.html', '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=pages/stage-1.html">');
console.log('Created results/pages/stage-1.html through stage-6.html');