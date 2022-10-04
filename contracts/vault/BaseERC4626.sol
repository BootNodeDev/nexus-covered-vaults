// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title BaseERC4626
 * @dev Base implementation of the ERC4626 "Tokenized Vault Standard"
 */
abstract contract BaseERC4626 is ERC4626, ERC20Permit {
  using Math for uint256;

  /* ========== Custom Errors ========== */

  error BaseERC4626__DepositMoreThanMax();
  error BaseERC4626__MintMoreThanMax();

  /**
   * @dev Set the underlying vault contract, name and symbol of the vault.
   * @param _asset Underlying asset
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   */
  constructor(
    IERC20 _asset,
    string memory _name,
    string memory _symbol
  ) ERC4626(_asset) ERC20(_name, _symbol) ERC20Permit(_name) {
    // solhint-disable-previous-line no-empty-blocks
  }

  /* ========== View methods ========== */

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

  /** @dev See {IERC4626-maxDeposit}. */
  function maxDeposit(address _receiver) public view virtual override returns (uint256 maxAvailableDeposit) {
    (maxAvailableDeposit, ) = _maxDeposit(_receiver);
  }

  /** @dev See {IERC4626-maxMint}. */
  function maxMint(address _receiver) public view virtual override returns (uint256 maxAvailableMint) {
    (maxAvailableMint, ) = _maxMint(_receiver);
  }

  /* ========== User methods ========== */

  /** @dev See {IERC4626-deposit}. */
  function deposit(uint256 _assets, address _receiver) public virtual override returns (uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets) = _maxDeposit(_receiver);
    if (_assets > maxAvailableDeposit) revert BaseERC4626__DepositMoreThanMax();

    uint256 shares = _convertToShares(_assets, Math.Rounding.Down, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, _assets, shares);

    return shares;
  }

  /** @dev See {IERC4626-mint}. */
  function mint(uint256 _shares, address _receiver) public virtual override returns (uint256) {
    (uint256 maxAvailableMint, uint256 vaultTotalAssets) = _maxMint(_receiver);
    if (_shares > maxAvailableMint) revert BaseERC4626__MintMoreThanMax();

    uint256 assets = _convertToAssets(_shares, Math.Rounding.Up, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, assets, _shares);

    return assets;
  }

  /* ========== Internal methods ========== */

  /** @dev See {IERC4626-maxMint}. */
  function _maxMint(address _receiver) internal view returns (uint256, uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets) = _maxDeposit(_receiver);
    uint256 maxAvailableMint = _convertToShares(maxAvailableDeposit, Math.Rounding.Down, vaultTotalAssets);

    return (maxAvailableMint, vaultTotalAssets);
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
    uint256 calculatedTotalAssets
  ) internal view returns (uint256 shares) {
    uint256 supply = totalSupply();
    return
      (assets == 0 || supply == 0)
        ? _initialConvertToShares(assets, rounding)
        : assets.mulDiv(supply, calculatedTotalAssets, rounding);
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
    return _convertToShares(assets, rounding, _totalAssets(preview));
  }

  /**
   * @dev Internal conversion function (from shares to assets) with support for rounding direction.
   */
  function _convertToAssets(
    uint256 shares,
    Math.Rounding rounding,
    uint256 calculatedTotalAssets
  ) internal view returns (uint256 assets) {
    uint256 supply = totalSupply();
    return
      (supply == 0)
        ? _initialConvertToAssets(shares, rounding)
        : shares.mulDiv(calculatedTotalAssets, supply, rounding);
  }

  /**
   * @dev Internal conversion function (from shares to assets) with support for rounding direction.
   */
  function _convertToAssets(
    uint256 shares,
    Math.Rounding rounding,
    bool preview
  ) internal view returns (uint256 assets) {
    return _convertToAssets(shares, rounding, _totalAssets(preview));
  }

  /** @dev See {IERC4626-maxDeposit}. */
  function _maxDeposit(address) internal view virtual returns (uint256, uint256);

  /** @dev See {IERC4626-totalAssets}. */
  function _totalAssets(bool preview) internal view virtual returns (uint256);
}
