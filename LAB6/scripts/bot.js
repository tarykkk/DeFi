require("dotenv").config();
const { ethers } = require("ethers");
const deployment = require("../deployment.json");

const RPC = process.env.SEPOLIA_RPC_URL;
const KEY = process.env.LIQUIDATOR_PRIVATE_KEY;
const POLL_MS = 12_000;

const targets = (process.env.MONITOR_ADDRESSES || deployment.borrower)
  .split(",").map((s) => s.trim()).filter(Boolean);

const ENGINE_ABI = [
  "function getHealthFactor(address user) view returns (uint256)",
  "function sUsdMinted(address user) view returns (uint256)",
  "function liquidate(address user)",
  "event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString("uk-UA");

async function main() {
  if (!RPC || !KEY) throw new Error("Fill in SEPOLIA_RPC_URL and LIQUIDATOR_PRIVATE_KEY in .env");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(KEY, provider);
  const engine = new ethers.Contract(deployment.engine, ENGINE_ABI, wallet);
  const coin = new ethers.Contract(deployment.stableCoin, ERC20_ABI, provider);

  console.log("Launching the liquidation bot. Waiting for a price change....");
  console.log("Liquidator:", wallet.address);
  console.log("Engine:   ", deployment.engine);
  console.log("Monitoring:", targets.join(", "), "\n");

  while (true) {
    for (const user of targets) {
      try {
        const debt = await engine.sUsdMinted(user);
        if (debt === 0n) {
          console.log(`[${ts()}] Position ${user} | No outstanding debt`);
          continue;
        }

        const hf = await engine.getHealthFactor(user);
        console.log(`[${ts()}] Position ${user} | HF: ${ethers.formatEther(hf)}`);

        if (hf < ethers.WeiPerEther) {
          console.log(`[WARNING] Insolvent position detected ${user}! Initiation of liquidation...`);

          const bal = await coin.balanceOf(wallet.address);
          if (bal < debt) {
            console.log(`[ERROR] Insufficient rUSD: є ${ethers.formatEther(bal)}, needed ${ethers.formatEther(debt)}`);
            continue;
          }

          const tx = await engine.liquidate(user);
          console.log("Transaction sent. Tx:", tx.hash);
          const receipt = await tx.wait();

          for (const log of receipt.logs) {
            try {
              const p = engine.interface.parseLog(log);
              if (p && p.name === "Liquidated") {
                console.log(`Debt repaid: ${ethers.formatEther(p.args.debtCovered)} rUSD`);
                console.log(`Collateral received (with bonus): ${ethers.formatEther(p.args.collateralSeized)} ETH`);
              }
            } catch (_) {}
          }
          console.log(`[SUCCESS] Position eliminated in block ${receipt.blockNumber}. Tx: ${receipt.hash}`);
          console.log(`https://sepolia.etherscan.io/tx/${receipt.hash}\n`);
        }
      } catch (err) {
        console.error(`[${ts()}] Position verification error ${user}:`, err.shortMessage || err.message);
      }
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });