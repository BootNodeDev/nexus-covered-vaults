// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import { AccessManager } from "./access/AccessManager.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CoveredVault
 * @dev An ERC-4626 vault that invest the assets in an underlying ERC-4626 vault. Invested funds are protected by
 * purchasing coverage on Nexus Mutual.
 */
contract CoveredVault is ERC4626, ERC20Permit, AccessManager {
  using Math for uint256;

  /** @dev Role for botOperator */
  bytes32 public constant BOT_ROLE = keccak256("BOT_ROLE");

  IERC4626 public immutable underlyingVault;

  error CoveredVault__DepositSlippage();
  error CoveredVault__MintSlippage();
  error CoveredVault__WithdrawSlippage();
  error CoveredVault__RedeemSlippage();

  /**
   * @dev Set the underlying vault contract, name and symbol of the vault.
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address' admin operator
   */
  constructor(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin
  ) ERC4626(IERC20(_underlyingVault.asset())) ERC20(_name, _symbol) ERC20Permit(_name) AccessManager(_admin) {
    underlyingVault = _underlyingVault;
  }

  /** @dev See {IERC20Metadata-decimals}. */
  function decimals() public view override(ERC4626, ERC20) returns (uint8) {
    return super.decimals();
  }

  /** @dev See {IERC4626-totalAssets}. */
  function totalAssets() public view override returns (uint256) {
    return _totalAssets(false);
  }

  /** @dev See {IERC4626-convertToShares}. */
  function convertToShares(uint256 assets) public view override returns (uint256 shares) {
    return _convertToShares(assets, Math.Rounding.Down, false);
  }

  /** @dev See {IERC4626-convertToAssets}. */
  function convertToAssets(uint256 shares) public view override returns (uint256 assets) {
    return _convertToAssets(shares, Math.Rounding.Down, false);
  }

  /** @dev See {IERC4626-previewDeposit}. */
  function previewDeposit(uint256 assets) public view override returns (uint256) {
    return _convertToShares(assets, Math.Rounding.Down, false);
  }

  /** @dev See {IERC4626-previewMint}. */
  function previewMint(uint256 shares) public view override returns (uint256) {
    return _convertToAssets(shares, Math.Rounding.Up, false);
  }

  /** @dev See {IERC4626-previewWithdraw}. */
  function previewWithdraw(uint256 assets) public view override returns (uint256) {
    return _convertToShares(assets, Math.Rounding.Up, true);
  }

  /** @dev See {IERC4626-previewRedeem}. */
  function previewRedeem(uint256 shares) public view override returns (uint256) {
    return _convertToAssets(shares, Math.Rounding.Down, true);
  }

  /**
   * @dev Overloaded version of ERC-4626’s deposit. Reverts if depositing _assets mints less than _minShares shares
   * @param _assets Amount of assets to deposit
   * @param _receiver Account that receives the minted shares
   * @param _minShares Minimum amount of shares to receive
   */
  function deposit(
    uint256 _assets,
    address _receiver,
    uint256 _minShares
  ) external returns (uint256) {
    uint256 shares = deposit(_assets, _receiver);
    if (shares < _minShares) revert CoveredVault__DepositSlippage();
    return shares;
  }

  /**
   * @dev Overloaded version of ERC-4626’s mint. Reverts if to mint _shares more than _maxAssets assets are deposited
   * @param _shares Amount of shares to mint
   * @param _receiver Account that receives the minted shares
   * @param _maxAssets Maximum amount of assets to deposit
   */
  function mint(
    uint256 _shares,
    address _receiver,
    uint256 _maxAssets
  ) external returns (uint256) {
    uint256 assets = mint(_shares, _receiver);
    if (assets > _maxAssets) revert CoveredVault__MintSlippage();
    return assets;
  }

  /**
   * @dev Overloaded version of ERC-4626’s withdraw. Reverts if to withdraw _assets more than _maxShares shares are burned
   * @param _assets Amount of assets to withdraw
   * @param _receiver Account that receives the withdrawed assets
   * @param _owner Account from where shares are burned
   * @param _maxShares Maximum amount of shares to burn
   */
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner,
    uint256 _maxShares
  ) external returns (uint256) {
    uint256 shares = withdraw(_assets, _receiver, _owner);
    if (shares > _maxShares) revert CoveredVault__WithdrawSlippage();
    return shares;
  }

  /**
   * @dev Overloaded version of ERC-4626’s redeem. Reverts if redeemed assets are less than _minAssets
   * @param _shares Amount of shares to burn
   * @param _receiver Account that receives the redeemed assets
   * @param _owner Account from where shares are burned
   * @param _minAssets Minimum amount of assets to receive
   */
  function redeem(
    uint256 _shares,
    address _receiver,
    address _owner,
    uint256 _minAssets
  ) external returns (uint256) {
    uint256 assets = redeem(_shares, _receiver, _owner);
    if (assets < _minAssets) revert CoveredVault__RedeemSlippage();
    return assets;
  }

  /**
   * @dev Internal conversion function (from assets to shares) with support for rounding direction.
   *
   * Will revert if assets > 0, totalSupply > 0 and totalAssets = 0. That corresponds to a case where any asset
   * would represent an infinite amount of shares.
   */
  function _convertToShares(
    uint256 assets,
    Math.Rounding rounding,
    bool preview
  ) internal view returns (uint256 shares) {
    uint256 supply = totalSupply();
    return
      (assets == 0 || supply == 0)
        ? _initialConvertToShares(assets, rounding)
        : assets.mulDiv(supply, _totalAssets(preview), rounding);
  }

  /**
   * @dev Internal conversion function (from shares to assets) with support for rounding direction.
   */
  function _convertToAssets(
    uint256 shares,
    Math.Rounding rounding,
    bool preview
  ) internal view returns (uint256 assets) {
    uint256 supply = totalSupply();
    return
      (supply == 0)
        ? _initialConvertToAssets(shares, rounding)
        : shares.mulDiv(_totalAssets(preview), supply, rounding);
  }

  /** @dev See {IERC4626-totalAssets}. */
  function _totalAssets(bool preview) internal view returns (uint256) {
    uint256 underlyingShares = underlyingVault.balanceOf(address(this));
    uint256 underlyingAssets = preview == true
      ? underlyingVault.previewRedeem(underlyingShares)
      : underlyingVault.convertToAssets(underlyingShares);
    return underlyingAssets + super.totalAssets();
  }

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
}
