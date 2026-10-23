const { ethers } = require("hardhat");
const d = require("../deployment.json");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];
const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
const PAIR_ABI = [
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
];

async function reserves(factory) {
  const pairAddr = await factory.getPair(d.tokenA, d.tokenB);
  if (pairAddr === ethers.ZeroAddress) return { pairAddr, rA: 0n, rB: 0n };
  const pair = new ethers.Contract(pairAddr, PAIR_ABI, ethers.provider);
  const [r0, r1] = await pair.getReserves();
  const t0 = (await pair.token0()).toLowerCase();
  const aIs0 = t0 === d.tokenA.toLowerCase();
  return { pairAddr, rA: aIs0 ? r0 : r1, rB: aIs0 ? r1 : r0 };
}

async function main() {
  const [signer] = await ethers.getSigners();
  const router = new ethers.Contract(d.router, ROUTER_ABI, signer);
  const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, signer);
  const tokenA = new ethers.Contract(d.tokenA, ERC20_ABI, signer);
  const tokenB = new ethers.Contract(d.tokenB, ERC20_ABI, signer);
  const decA = await tokenA.decimals();
  const decB = await tokenB.decimals();

  console.log("Wallet balance | Token A:", ethers.formatUnits(await tokenA.balanceOf(signer.address), decA));
  console.log("Wallet balance | Token B:", ethers.formatUnits(await tokenB.balanceOf(signer.address), decB));

  let r = await reserves(factory);
  console.log("A/B pair:", r.pairAddr);
  console.log("Reserves: A =", ethers.formatUnits(r.rA, decA), "| B =", ethers.formatUnits(r.rB, decB));

  if (r.rA > 0n && r.rB > 0n) {
    console.log("The pool has liquidity; nothing needs to be added.");
    return;
  }

  const amtA = ethers.parseUnits(process.env.LIQ_A || "5000", decA);
  const amtB = ethers.parseUnits(process.env.LIQ_B || "5000", decB);
  console.log("The pool is empty. Adding liquidity...");
  await (await tokenA.approve(d.router, amtA)).wait();
  await (await tokenB.approve(d.router, amtB)).wait();
  const deadline = Math.floor(Date.now() / 1000) + 600;
  await (await router.addLiquidity(d.tokenA, d.tokenB, amtA, amtB, 0, 0, signer.address, deadline)).wait();

  r = await reserves(factory);
  console.log("New reserves: A =", ethers.formatUnits(r.rA, decA), "| B =", ethers.formatUnits(r.rB, decB));
}

main().catch((e) => { console.error(e); process.exit(1); });