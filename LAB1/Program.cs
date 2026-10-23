using System;
using System.Numerics;
using System.Threading.Tasks;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;
using Nethereum.Signer;
using Nethereum.Util;

namespace TarasyukLab1
{
    class Program
    {
        static async Task Main(string[] args)
        {
            // 1. Встав сюди свій HTTP RPC URL з Alchemy
            string rpcUrl = "https://eth-sepolia.g.alchemy.com/v2/alch_pDyIfWxZQPmL0wgHtgGjD";
            
            // Твій знайдений та вже поповнений приватний ключ першого гаманця (відправника)
            string senderPrivateKey = "0x1a4c6831ff412f5b1a44eac557c979a1d036d598846eb47d6a6a9e9ad1cd4a1e";

            var account1 = new Account(senderPrivateKey);
            var web3 = new Web3(account1, rpcUrl);

            Console.WriteLine($"Відправник (Гаманець 1): {account1.Address}");

            // ==========================================
            // 2. Генерація другого гаманця (отримувача) за Proof of Work (префікс 0x11)
            // ==========================================
            string targetPrefix = "0x11";
            EthECKey recipientEcKey;
            string recipientAddress = "";
            int attempts = 0;

            Console.WriteLine($"\nПошук другого гаманця з префіксом {targetPrefix}...");
            do
            {
                attempts++;
                recipientEcKey = EthECKey.GenerateKey();
                recipientAddress = recipientEcKey.GetPublicAddress();
            }
            while (!recipientAddress.StartsWith(targetPrefix, StringComparison.OrdinalIgnoreCase));

            Console.WriteLine($"Другий гаманець знайдено за {attempts} спроб!");
            Console.WriteLine($"Публічна адреса отримувача (Гаманець 2): {recipientAddress}\n");

            // 3. Перевірка початкових балансів
            var initialSenderBalance = await web3.Eth.GetBalance.SendRequestAsync(account1.Address);
            Console.WriteLine($"Початковий баланс Гаманця 1: {Web3.Convert.FromWei(initialSenderBalance.Value)} ETH");

            // ==========================================
            // 4. Проведення транзакції з Гаманця 1 на Гаманець 2
            // ==========================================
            decimal amountToSendInEther = 0.001m;
            Console.WriteLine($"\nНадсилання {amountToSendInEther} ETH з Гаманця 1 на Гаманець 2...");

            var receipt = await web3.Eth.GetEtherTransferService()
                .TransferEtherAndWaitForReceiptAsync(recipientAddress, amountToSendInEther);

            Console.WriteLine("\n---- Транзакція успішно виконана ----");
            Console.WriteLine($"Transaction hash: {receipt.TransactionHash}");
            Console.WriteLine($"Block number:     {receipt.BlockNumber.Value}");
            Console.WriteLine($"Gas consumed:     {receipt.GasUsed}");
            Console.WriteLine($"Execution status: {(receipt.Status.Value == 1 ? "Успішно (1)" : "Помилка (0)")}");

            // 5. Перевірка оновлених балансів обох гаманців
            var finalSenderBalance = await web3.Eth.GetBalance.SendRequestAsync(account1.Address);
            var finalRecipientBalance = await web3.Eth.GetBalance.SendRequestAsync(recipientAddress);

            Console.WriteLine("\n---- Оновлені баланси ----");
            Console.WriteLine($"Гаманець 1 (Відправник):  {Web3.Convert.FromWei(finalSenderBalance.Value)} ETH");
            Console.WriteLine($"Гаманець 2 (Отримувач):   {Web3.Convert.FromWei(finalRecipientBalance.Value)} ETH");
        }
    }
}