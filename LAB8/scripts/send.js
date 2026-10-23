const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const d = require("../deployment.json");
const { ARB_SEPOLIA } = require("./config");

async function main() {
  const [signer] = await ethers.getSigners();
  const messenger = await ethers.getContractAt("CrossChainMessenger", d.messenger, signer);
  const text = process.env.MESSAGE_TEXT || "Hello from Ridkovets Serhii";

  const linkAbi = ["function balanceOf(address) view returns (uint256)"];
  const link = new ethers.Contract(await messenger.linkToken(), linkAbi, signer);

  console.log("Sender:", signer.address);
  console.log("Messenger (Sepolia):", d.messenger);
  console.log("Receiver (Arbitrum Sepolia):", d.receiver);
  console.log("Chain Selector purpose:", ARB_SEPOLIA.selector);
  console.log("Text:", text);

  const fee = await messenger.quoteFee(ARB_SEPOLIA.selector, d.receiver, text);
  const bal = await link.balanceOf(d.messenger);
  console.log("CCIP Commission:", ethers.formatEther(fee), "LINK");
  console.log("LINK in Messenger:", ethers.formatEther(bal), "LINK");
  if (bal < fee) throw new Error("Not enough LINK in Messenger");

  console.log("\nSending message...");
  const tx = await messenger.sendMessage(ARB_SEPOLIA.selector, d.receiver, text);
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();

  let messageId;
  for (const log of receipt.logs) {
    try {
      const p = messenger.interface.parseLog(log);
      if (p && p.name === "MessageSent") {
        messageId = p.args.messageId;
        console.log("Commissions paid:", ethers.formatEther(p.args.feePaid), "LINK");
      }
    } catch (_) {}
  }

  console.log("\nMessageId:", messageId);
  console.log("Sepolia Etherscan:   https://sepolia.etherscan.io/tx/" + receipt.hash);
  console.log("CCIP Explorer:       https://ccip.chain.link/msg/" + messageId);

  fs.writeFileSync(
    path.join(__dirname, "..", "last-message.json"),
    JSON.stringify({ messageId, text, txHash: receipt.hash }, null, 2)
  );
}

main().catch((e) => { console.error(e); process.exit(1); });