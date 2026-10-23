const { ethers } = require("hardhat");
const d = require("../deployment.json");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [investor] = await ethers.getSigners();
  const vault = await ethers.getContractAt("AutoCompoundVault", d.vault, investor);
  const tokenA = new ethers.Contract(d.tokenA, ERC20_ABI, investor);
  const tokenB = new ethers.Contract(d.tokenB, ERC20_ABI, investor);

  const dec = await tokenA.decimals();
  const decB = await tokenB.decimals();
  const fA = (v) => ethers.formatUnits(v, dec);
  const ONE_SHARE = ethers.parseUnits("1", 18);
  const depositAmount = ethers.parseUnits(process.env.DEPOSIT_AMOUNT || "1000", dec);

  console.log("Investor:", investor.address);
  console.log("Reward (Token B) in the vault balance:", ethers.formatUnits(await tokenB.balanceOf(d.vault), decB));
  console.log("Deposit storage | totalAssets:", fA(await vault.totalAssets()), "| totalSupply:", ethers.formatUnits(await vault.totalSupply(), 18));

  if ((await tokenB.balanceOf(d.vault)) === 0n) throw new Error("There is no reward in the vault. First, complete: npm run reward");

  console.log("\n=== 1. DEPOSIT ===");
  const balBefore = await tokenA.balanceOf(investor.address);
  const sharesBefore = await vault.balanceOf(investor.address);
  await (await tokenA.approve(d.vault, depositAmount)).wait();
  const depTx = await vault.deposit(depositAmount);
  await depTx.wait();
  const shares = (await vault.balanceOf(investor.address)) - sharesBefore;
  console.log("Token A deposited:", fA(depositAmount));
  console.log("Shares received:", ethers.formatUnits(shares, 18));
  console.log("Deposit transaction:", depTx.hash);

  console.log("\n=== 2. SHARE PRICE BEFORE COMPOUND ===");
  const assetsBefore = await vault.convertToAssets(shares);
  console.log("convertToAssets(shares):", fA(assetsBefore), "Token A");
  console.log("Price per share:", fA(await vault.convertToAssets(ONE_SHARE)), "Token A");
  console.log("totalAssets:", fA(await vault.totalAssets()));

  console.log("\n=== 3. COMPOUND ===");
  const cTx = await vault.compound();
  console.log("Tx compound:", cTx.hash);
  const cReceipt = await cTx.wait();
  for (const log of cReceipt.logs) {
    try {
      const p = vault.interface.parseLog(log);
      if (p && p.name === "Compounded") {
        console.log("Token B sold:", ethers.formatUnits(p.args.rewardSold, decB));
        console.log("Token A received:", fA(p.args.assetsReinvested));
      }
    } catch (_) {}
  }

  console.log("\n=== 4. SHARE PRICE AFTER COMPOUND ===");
  const assetsAfter = await vault.convertToAssets(shares);
  console.log("Number of shares:", ethers.formatUnits(shares, 18));
  console.log("convertToAssets(shares):", fA(assetsAfter), "Token A");
  console.log("Price per share:", fA(await vault.convertToAssets(ONE_SHARE)), "Token A");
  console.log("totalAssets:", fA(await vault.totalAssets()));
  console.log("Profit from compounding:", fA(assetsAfter - depositAmount), "Token A");

  console.log("\n=== 5. WITHDRAWAL ===");
  const balMid = await tokenA.balanceOf(investor.address);
  const wTx = await vault.withdraw(shares);
  await wTx.wait();
  const balEnd = await tokenA.balanceOf(investor.address);
  const received = balEnd - balMid;
  console.log("Withdrawal transaction:", wTx.hash);
  console.log("Submitted:  ", fA(depositAmount), "Token A");
  console.log("Withdrawn:    ", fA(received), "Token A");
  console.log("Net result for the entire cycle:", fA(balEnd - balBefore), "Token A");
  console.log(received > depositAmount ? "PROVEN: more was withdrawn than deposited." : "No more has been withdrawn than was deposited.");
}

main().catch((e) => { console.error(e); process.exit(1); });