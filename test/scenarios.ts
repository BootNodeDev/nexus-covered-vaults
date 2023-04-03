import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployVaultAssetFixture, deployVaultFixture } from "./utils/fixtures";

// TODO Fix .mul(3)
describe.only("Scenarios", function () {
  describe("Base", function () {
    it("Should return amount of shares after yield", async function () {
      const { underlyingAsset, vault, underlyingVault } = await loadFixture(deployVaultFixture);
      const [userA, userB, userC, admin, bot] = await ethers.getSigners();

      // User A deposits 1000 DAI and gets 1000 shares
      const userAAmount = ethers.utils.parseEther("1000");
      await underlyingAsset.mint(userA.address, userAAmount);
      await underlyingAsset.connect(userA).approve(vault.address, userAAmount.mul(3));
      await vault.connect(userA)["deposit(uint256,address)"](userAAmount, userA.address);
      const userAShares = await vault.balanceOf(userA.address);
      expect(userAShares).to.be.eq(userAAmount);

      // User B deposits 2000 DAI and gets 2000 shares
      const userBAmount = ethers.utils.parseEther("2000");
      await underlyingAsset.mint(userB.address, userBAmount);
      await underlyingAsset.connect(userB).approve(vault.address, userBAmount.mul(3));
      await vault.connect(userB)["deposit(uint256,address)"](userBAmount, userB.address);
      const userBShares = await vault.balanceOf(userB.address);
      expect(userBShares).to.be.eq(userBAmount);

      // 100% of funds deployed to underlying vault
      const operatorRole = await vault.OPERATOR_ROLE();
      await vault.connect(admin).grantRole(operatorRole, bot.address);
      await vault.connect(bot).invest(userAAmount.add(userBAmount));
      const investedAssets = await underlyingAsset.balanceOf(underlyingVault.address);
      expect(investedAssets).to.be.eq(userAAmount.add(userBAmount)); // 3000

      // Yield generated
      const yieldAmount1 = ethers.utils.parseEther("100");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount1);

      // User A withdraws 1000 shares
      await vault.connect(userA)["withdraw(uint256,address,address)"](userAAmount, userA.address, userA.address);

      // Yield generated
      const yieldAmount2 = ethers.utils.parseEther("33");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount2);

      // User C deposits 500 DAI and gets 476 shares
      const userCAmount = ethers.utils.parseEther("500");
      const expectedWithdrawLowerBound = ethers.utils.parseEther("476");
      const expectedWithdrawUpperBound = ethers.utils.parseEther("477");

      await underlyingAsset.mint(userC.address, userCAmount);
      await underlyingAsset.connect(userC).approve(vault.address, ethers.utils.parseEther("100000000000"));
      await vault.connect(userC)["deposit(uint256,address)"](userCAmount, userC.address);
      const userCShares = await vault.balanceOf(userC.address);
      expect(userCShares).to.be.gt(expectedWithdrawLowerBound).and.be.lt(expectedWithdrawUpperBound);

      // User B withdraw 1000 shares

      // Yield generated
      const yieldAmount3 = ethers.utils.parseEther("50");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount3);

      // User C withdraw 476 shares
      const withdrawUserC = ethers.utils.parseEther("476");
      await vault.connect(userC)["withdraw(uint256,address,address)"](withdrawUserC, userC.address, userC.address);

      // user B withdraw 1000 shares
      const withdrawUserB = ethers.utils.parseEther("1000");
      await vault.connect(userB)["withdraw(uint256,address,address)"](withdrawUserB, userB.address, userB.address);
    });
  });

  describe("Base + Cover", function () {
    it("Should rebalance cover and be able to withdraw all funds", async function () {
      const { coverManager, underlyingAsset, vault, underlyingVault } = await loadFixture(deployVaultAssetFixture);
      const [userA, userB, userC, admin, bot] = await ethers.getSigners();

      // User A deposits 1000 DAI and gets 1000 shares
      const userAAmount = ethers.utils.parseEther("1000");
      await underlyingAsset.mint(userA.address, userAAmount);
      await underlyingAsset.connect(userA).approve(vault.address, userAAmount.mul(3));
      await vault.connect(userA)["deposit(uint256,address)"](userAAmount, userA.address);
      const userAShares = await vault.balanceOf(userA.address);
      expect(userAShares).to.be.eq(userAAmount);

      // User B deposits 2000 DAI and gets 2000 shares
      const userBAmount = ethers.utils.parseEther("2000");
      await underlyingAsset.mint(userB.address, userBAmount);
      await underlyingAsset.connect(userB).approve(vault.address, userBAmount.mul(3));
      await vault.connect(userB)["deposit(uint256,address)"](userBAmount, userB.address);
      const userBShares = await vault.balanceOf(userB.address);
      expect(userBShares).to.be.eq(userBAmount);

      // 100% of funds deployed to underlying vault
      const totalDeployed = userAAmount.add(userBAmount);
      const operatorRole = await vault.OPERATOR_ROLE();
      await vault.connect(admin).grantRole(operatorRole, bot.address);
      await vault.connect(bot).invest(totalDeployed);
      const investedAssets = await underlyingAsset.balanceOf(underlyingVault.address);
      expect(investedAssets).to.be.eq(totalDeployed); // 3000

      // buyCover
      const premium = ethers.utils.parseEther("30");
      await coverManager.connect(admin).addToAllowList(vault.address);
      await underlyingAsset.mint(admin.address, premium.mul(20));
      await underlyingAsset.connect(admin).approve(coverManager.address, premium);
      await coverManager.connect(admin).depositOnBehalf(underlyingAsset.address, premium, vault.address);
      await vault.connect(admin).buyCover(totalDeployed, 90, premium, []);

      // Yield generated
      const yieldAmount1 = ethers.utils.parseEther("100");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount1);

      // TODO Cover Update past 30 days. Rebalance days.

      // User A withdraws 1000 shares
      await vault.connect(userA)["withdraw(uint256,address,address)"](userAAmount, userA.address, userA.address);

      // Yield generated
      const yieldAmount2 = ethers.utils.parseEther("33");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount2);

      // User C deposits 500 DAI and gets 476 shares
      const userCAmount = ethers.utils.parseEther("500");
      const expectedWithdrawLowerBound = ethers.utils.parseEther("476");
      const expectedWithdrawUpperBound = ethers.utils.parseEther("477");

      await underlyingAsset.mint(userC.address, userCAmount);
      await underlyingAsset.connect(userC).approve(vault.address, ethers.utils.parseEther("100000000000"));
      await vault.connect(userC)["deposit(uint256,address)"](userCAmount, userC.address);
      const userCShares = await vault.balanceOf(userC.address);
      expect(userCShares).to.be.gt(expectedWithdrawLowerBound).and.be.lt(expectedWithdrawUpperBound);

      // Yield generated
      const yieldAmount3 = ethers.utils.parseEther("50");
      await underlyingAsset.mint(underlyingVault.address, yieldAmount3);

      // User C withdraw 476 shares
      const withdrawUserC = ethers.utils.parseEther("476");
      await vault.connect(userC)["withdraw(uint256,address,address)"](withdrawUserC, userC.address, userC.address);

      // user B withdraw 1000 shares
      const withdrawUserB = ethers.utils.parseEther("1000");
      await vault.connect(userB)["withdraw(uint256,address,address)"](withdrawUserB, userB.address, userB.address);

      // TODO Operator withdraw all the shares
      await vault.connect(admin).withdrawCoverManagerAssets(vault.address, ethers.utils.parseEther("1"), userA.address);
    });
  });
});
