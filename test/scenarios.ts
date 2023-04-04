import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { deployScenariosFixture } from "./utils/fixtures";
import { daysToSeconds, deposit } from "./utils/utils";

const { parseEther } = ethers.utils;

describe("scenarios", function () {
  it("Multiples users deposits, invest, no incidents, everyone redeems all", async function () {
    const { underlyingAsset, vault, underlyingVault } = await loadFixture(deployScenariosFixture);
    const [user1, user2, user3, admin] = await ethers.getSigners();

    // User 1 deposits 1000 DAI and gets 1000 shares
    const user1Amount = parseEther("1000");
    const user1Shares = await deposit(user1Amount, user1, underlyingAsset, vault);
    expect(user1Shares).to.equal(parseEther("1000"));

    // User 2 deposits 2000 DAI and gets 2000 shares
    const user2Amount = parseEther("2000");
    const user2Shares = await deposit(user2Amount, user2, underlyingAsset, vault);
    expect(user2Shares).to.equal(parseEther("2000"));

    const idleAssets = await vault.idleAssets();

    // Buy cover
    await vault.connect(admin).buyCover(idleAssets, daysToSeconds(90), idleAssets.div(10), []);

    // 100% of funds deployed to underlying vault
    await vault.connect(admin).invest(idleAssets);
    const investedAssets = await underlyingAsset.balanceOf(underlyingVault.address);
    expect(investedAssets).to.be.eq(user1Amount.add(user2Amount)); // 3000

    // Yield generated
    const yieldAmount1 = parseEther("100");
    await underlyingAsset.mint(underlyingVault.address, yieldAmount1);

    // User 1 redeems 1000 shares
    await vault.connect(user1)["redeem(uint256,address,address)"](user1Shares, user1.address, user1.address);
    {
      const user1SharesAfter = await vault.balanceOf(user1.address);
      const user1AssetsAfter = await underlyingAsset.balanceOf(user1.address);
      expect(user1SharesAfter).to.equal(0);
      expect(user1AssetsAfter).to.be.gt(parseEther("1033")).and.be.lt(parseEther("1034"));
    }

    // Yield generated
    const yieldAmount2 = parseEther("33");
    await underlyingAsset.mint(underlyingVault.address, yieldAmount2);

    // User 3 deposits 500 DAI and gets 476 shares
    const user3Amount = parseEther("500");
    const user3Shares = await deposit(user3Amount, user3, underlyingAsset, vault);
    expect(user3Shares).to.be.gt(parseEther("476")).and.be.lt(parseEther("477"));

    // User 2 withdraw 1000 shares
    await vault.connect(user2)["redeem(uint256,address,address)"](user2Shares.div(2), user2.address, user2.address);
    {
      const user2SharesAfter = await vault.balanceOf(user2.address);
      const user2AssetsAfter = await underlyingAsset.balanceOf(user2.address);
      expect(user2SharesAfter).to.equal(parseEther("1000"));
      expect(user2AssetsAfter).to.be.gt(parseEther("1049")).and.be.lt(parseEther("1050"));
    }

    // Yield generated
    const yieldAmount3 = parseEther("50");
    await underlyingAsset.mint(underlyingVault.address, yieldAmount3);

    // User 3 withdraw 476 shares
    await vault.connect(user3)["redeem(uint256,address,address)"](user3Shares, user3.address, user3.address);
    {
      const user3SharesAfter = await vault.balanceOf(user3.address);
      const user3AssetsAfter = await underlyingAsset.balanceOf(user3.address);
      expect(user3SharesAfter).to.equal(0);
      expect(user3AssetsAfter).to.be.gt(parseEther("516")).and.be.lt(parseEther("517"));
    }

    // user 2 withdraw 1000 shares
    await vault.connect(user2)["redeem(uint256,address,address)"](user2Shares.div(2), user2.address, user2.address);
    {
      const user2SharesAfter = await vault.balanceOf(user2.address);
      const user2AssetsAfter = await underlyingAsset.balanceOf(user2.address);
      expect(user2SharesAfter).to.equal(0);
      expect(user2AssetsAfter).to.be.gt(parseEther("2133")).and.be.lt(parseEther("2134"));
    }
  });

  it("Multiples users deposits, invest, incident happens, cover paid, everyone redeems all", async function () {
    const { underlyingAsset, vault, underlyingVault, yieldTokenIncidents } = await loadFixture(deployScenariosFixture);
    const [user1, user2, user3, admin] = await ethers.getSigners();

    // User 1 deposits 1000 DAI and gets 1000 shares
    const user1Amount = parseEther("1000");
    const user1Shares = await deposit(user1Amount, user1, underlyingAsset, vault);
    expect(user1Shares).to.equal(parseEther("1000"));

    // User 2 deposits 2000 DAI and gets 2000 shares
    const user2Amount = parseEther("2000");
    const user2Shares = await deposit(user2Amount, user2, underlyingAsset, vault);
    expect(user2Shares).to.equal(parseEther("2000"));

    // User 3 deposits 2000 DAI and gets 2000 shares
    const user3Amount = parseEther("500");
    const user3Shares = await deposit(user3Amount, user3, underlyingAsset, vault);
    expect(user3Shares).to.equal(parseEther("500"));

    const idleAssets = await vault.idleAssets();

    // Buy cover
    await vault.connect(admin).buyCover(idleAssets, daysToSeconds(90), idleAssets.div(10), []);

    // 100% of funds deployed to underlying vault
    await vault.connect(admin).invest(idleAssets);
    const investedAssets = await underlyingAsset.balanceOf(underlyingVault.address);
    expect(investedAssets).to.be.eq(user1Amount.add(user2Amount).add(user3Amount)); // 3500

    // Incident happens - 100% loss
    await underlyingAsset.burn(underlyingVault.address, investedAssets);

    // Redeem Cover
    await yieldTokenIncidents.setPayoutAmount(
      investedAssets.mul(9).div(10),
      underlyingVault.address,
      underlyingAsset.address,
    );
    const deppegedTokens = await vault.underlyingVaultShares();
    await vault.connect(admin).redeemCover(0, 0, deppegedTokens, []);

    // User 1 redeems 1000 shares
    await vault.connect(user1)["redeem(uint256,address,address)"](user1Shares, user1.address, user1.address);
    {
      const user1SharesAfter = await vault.balanceOf(user1.address);
      const user1AssetsAfter = await underlyingAsset.balanceOf(user1.address);
      expect(user1SharesAfter).to.equal(0);
      expect(user1AssetsAfter).to.equal(user1Amount.mul(9).div(10));
    }

    // user 2 withdraw 2000 shares
    await vault.connect(user2)["redeem(uint256,address,address)"](user2Shares, user2.address, user2.address);
    {
      const user2SharesAfter = await vault.balanceOf(user2.address);
      const user2AssetsAfter = await underlyingAsset.balanceOf(user2.address);
      expect(user2SharesAfter).to.equal(0);
      expect(user2AssetsAfter).to.equal(user2Amount.mul(9).div(10));
    }

    // User 3 withdraw 500 shares
    await vault.connect(user3)["redeem(uint256,address,address)"](user3Shares, user3.address, user3.address);
    {
      const user3SharesAfter = await vault.balanceOf(user3.address);
      const user3AssetsAfter = await underlyingAsset.balanceOf(user3.address);
      expect(user3SharesAfter).to.equal(0);
      expect(user3AssetsAfter).to.equal(user3Amount.mul(9).div(10));
    }
  });

  it("Multiples users deposits, invest, incident happens, cover not redeemed, everyone redeems all", async function () {
    const { underlyingAsset, vault, underlyingVault } = await loadFixture(deployScenariosFixture);
    const [user1, user2, user3, admin] = await ethers.getSigners();

    // User 1 deposits 1000 DAI and gets 1000 shares
    const user1Amount = parseEther("1000");
    const user1Shares = await deposit(user1Amount, user1, underlyingAsset, vault);
    expect(user1Shares).to.equal(parseEther("1000"));

    // User 2 deposits 2000 DAI and gets 2000 shares
    const user2Amount = parseEther("2000");
    const user2Shares = await deposit(user2Amount, user2, underlyingAsset, vault);
    expect(user2Shares).to.equal(parseEther("2000"));

    // User 3 deposits 2000 DAI and gets 2000 shares
    const user3Amount = parseEther("500");
    const user3Shares = await deposit(user3Amount, user3, underlyingAsset, vault);
    expect(user3Shares).to.equal(parseEther("500"));

    const idleAssets = await vault.idleAssets();

    // Buy cover
    await vault.connect(admin).buyCover(idleAssets, daysToSeconds(90), idleAssets.div(10), []);

    // 100% of funds deployed to underlying vault
    await vault.connect(admin).invest(idleAssets);
    const investedAssets = await underlyingAsset.balanceOf(underlyingVault.address);
    expect(investedAssets).to.be.eq(user1Amount.add(user2Amount).add(user3Amount)); // 3500

    // Incident happens - 50% loss
    await underlyingAsset.burn(underlyingVault.address, investedAssets.div(2));

    // Redeem can't be done as assets were not covered or Nexus decided not to pay or whatever other situation
    // Admin needs to remove exchange rate safeguard to allow users to redeem
    await vault.connect(admin).setUnderlyingVaultRateThreshold(10000); // 100%

    // User 1 redeems 1000 shares
    await vault.connect(user1)["redeem(uint256,address,address)"](user1Shares, user1.address, user1.address);
    {
      const user1SharesAfter = await vault.balanceOf(user1.address);
      const user1AssetsAfter = await underlyingAsset.balanceOf(user1.address);
      expect(user1SharesAfter).to.equal(0);
      expect(user1AssetsAfter).to.equal(user1Amount.div(2));
    }

    // user 2 withdraw 2000 shares
    await vault.connect(user2)["redeem(uint256,address,address)"](user2Shares, user2.address, user2.address);
    {
      const user2SharesAfter = await vault.balanceOf(user2.address);
      const user2AssetsAfter = await underlyingAsset.balanceOf(user2.address);
      expect(user2SharesAfter).to.equal(0);
      expect(user2AssetsAfter).to.equal(user2Amount.div(2));
    }

    // User 3 withdraw 500 shares
    await vault.connect(user3)["redeem(uint256,address,address)"](user3Shares, user3.address, user3.address);
    {
      const user3SharesAfter = await vault.balanceOf(user3.address);
      const user3AssetsAfter = await underlyingAsset.balanceOf(user3.address);
      expect(user3SharesAfter).to.equal(0);
      expect(user3AssetsAfter).to.equal(user3Amount.div(2));
    }
  });
});
