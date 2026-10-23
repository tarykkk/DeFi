const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const govToken = process.env.GOV_TOKEN;
  if (!govToken) throw new Error("Specify GOV_TOKEN!");

  const [deployer] = await ethers.getSigners();
  console.log("Deploy from the account:", deployer.address);

  const token = new ethers.Contract(govToken, ERC20_ABI, deployer);
  const dec = await token.decimals();
  console.log("Governance token:", govToken, `(${await token.symbol()})`);
  console.log("Token balance:", ethers.formatUnits(await token.balanceOf(deployer.address), dec));

  const dao = await ethers.deployContract("SimpleDAO", [govToken]);
  await dao.waitForDeployment();
  const daoAddr = await dao.getAddress();
  console.log("\nSimpleDAO:", daoAddr);

  const initialFee = BigInt(process.env.INITIAL_FEE || "3");
  const mock = await ethers.deployContract("MockProtocol", [deployer.address, initialFee]);
  await mock.waitForDeployment();
  const mockAddr = await mock.getAddress();
  console.log("MockProtocol:", mockAddr);
  console.log("fee (initial):", (await mock.fee()).toString());
  console.log("owner before transfer:", await mock.owner());

  const tx = await mock.transferOwnership(daoAddr);
  console.log("transferOwnership Tx:", tx.hash);
  await tx.wait();
  const newOwner = await mock.owner();
  console.log("owner after transfer:", newOwner);
  console.log(newOwner === daoAddr ? "Now, only the DAO can change the fee." : "ATTENTION: the owner does not match the DAO!");

  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify({ network: "sepolia", dao: daoAddr, mock: mockAddr, govToken }, null, 2)
  );
  console.log("Saved to deployment.json");
}

main().catch((e) => { console.error(e); process.exit(1); });