// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { AccessManager } from "./vault/AccessManager.sol";
import { SafeERC4626 } from "./vault/SafeERC4626.sol";

/**
 * @title CoveredVault
 * @dev An ERC-4626 vault that invest the assets in an underlying ERC-4626 vault. Invested funds are protected by
 * purchasing coverage on Nexus Mutual.
 */
contract CoveredVault is SafeERC4626, AccessManager {
  /** @dev Role for botOperator */
  bytes32 public constant BOT_ROLE = keccak256("BOT_ROLE");

  IERC4626 public immutable underlyingVault;

  /** @dev Maximum amount of assets that can be managed by the vault.
   * Helps to protect the growth of the vault and make sure all deposited assets can be invested and insured.
   * Used to calculate the available amount for new deposits.
   */
  uint256 public maxAssetsLimit;

  /* ========== Events ========== */

  /**
   * @dev Emitted when assets are invested into the underlying vault
   */
  event Invested(uint256 amount, uint256 shares, address sender);

  /**
   * @dev Emitted when shares are uninvested out of the underlying vault
   */
  event UnInvested(uint256 amount, uint256 shares, address sender);

  /**
   * @dev Emitted when the max amount of assets that can be managed by the vault is updated
   */
  event MaxAssetsLimitUpdated(uint256 newLimit);

  /* ========== Constructor ========== */

  /**
   * @dev Set the underlying vault contract, name and symbol of the vault.
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address' admin operator
   * @param _maxAssetsLimit New maximum asset amount limit
   */
  constructor(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit
  ) SafeERC4626(IERC20(_underlyingVault.asset()), _name, _symbol) AccessManager(_admin) {
    underlyingVault = _underlyingVault;
    maxAssetsLimit = _maxAssetsLimit;
  }

  /* ========== User methods ========== */

  /** @dev See {IERC4626-deposit}. */
  function deposit(uint256 _assets, address _receiver) public override whenNotPaused returns (uint256) {
    return super.deposit(_assets, _receiver);
  }

  /** @dev See {IERC4626-mint}. */
  function mint(uint256 _shares, address _receiver) public override whenNotPaused returns (uint256) {
    return super.mint(_shares, _receiver);
  }

  /** @dev See {IERC4626-withdraw}. */
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) public override whenNotPaused returns (uint256) {
    return super.withdraw(_assets, _receiver, _owner);
  }

  /** @dev See {IERC4626-redeem}. */
  function redeem(uint256 _shares, address _receiver, address _owner) public override whenNotPaused returns (uint256) {
    return super.redeem(_shares, _receiver, _owner);
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Invest idle vault assets into the underlying vault. Only operator roles can call this method.
   * @param _amount Amount of assets to invest
   */
  function invest(uint256 _amount) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    IERC20(asset()).approve(address(underlyingVault), _amount);
    uint256 shares = underlyingVault.deposit(_amount, address(this));

    emit Invested(_amount, shares, msg.sender);
  }

  /**
   * @dev Uninvest active vault assets out of the underlying vault. Only operator roles can call this method.
   * @param _shares Amount of shares to uninvest
   */
  function uninvest(uint256 _shares) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    uint256 assets = underlyingVault.redeem(_shares, address(this), address(this));

    emit UnInvested(assets, _shares, msg.sender);
  }

  /**
   * @dev Sets the maximum amount of assets that can be managed by the vault. Used to calculate the available amount
   * for new deposits.
   * @param _maxAssetsLimit New maximum asset amount limit
   */
  function setMaxAssetsLimit(uint256 _maxAssetsLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
    maxAssetsLimit = _maxAssetsLimit;

    emit MaxAssetsLimitUpdated(_maxAssetsLimit);
  }

  /* ========== Internal methods ========== */

  /**
   * @dev Withdraw/redeem common workflow.
   */
  function _withdraw(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
  ) internal override {
    if (caller != owner) {
      _spendAllowance(owner, caller, shares);
    }

    _burn(owner, shares);

    uint256 uninvestedAssets = IERC20(asset()).balanceOf(address(this));

    if (assets > uninvestedAssets) {
      underlyingVault.withdraw(assets - uninvestedAssets, address(this), address(this));
    }

    SafeERC20.safeTransfer(IERC20(asset()), receiver, assets);

    emit Withdraw(caller, receiver, owner, assets, shares);
  }

  /** @dev See {IERC4626-maxDeposit}. */
  function _maxDeposit(address) internal view override returns (uint256, uint256) {
    uint256 assets = _totalAssets(false);
    if (assets >= maxAssetsLimit) return (0, assets);

    unchecked {
      return (maxAssetsLimit - assets, assets);
    }
  }

  /** @dev See {IERC4626-totalAssets}. */
  function _totalAssets(bool preview) internal view override returns (uint256) {
    uint256 underlyingShares = underlyingVault.balanceOf(address(this));
    uint256 underlyingAssets = preview == true
      ? underlyingVault.previewRedeem(underlyingShares)
      : underlyingVault.convertToAssets(underlyingShares);
    return underlyingAssets + ERC4626.totalAssets();
  }
}
