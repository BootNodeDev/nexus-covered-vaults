// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { BuyCoverParams, PoolAllocationRequest } from "./interfaces/ICover.sol";
import { ICoverManager } from "./interfaces/ICoverManager.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { FeeManager } from "./vault/FeeManager.sol";
import { SafeERC4626 } from "./vault/SafeERC4626.sol";

/**
 * @title CoveredVault
 * @dev An ERC-4626 vault that invest the assets in an underlying ERC-4626 vault. Invested funds are protected by
 * purchasing coverage on Nexus Mutual.
 */
contract CoveredVault is SafeERC4626, FeeManager {
  using SafeERC20 for IERC20;

  /**
   * @dev CoverId assigned on buyCover
   */
  uint256 public coverId;

  /** @dev CoverId assigned on buyCover */

  /**
   * @dev Address of the underlying vault
   */
  IERC4626 public immutable underlyingVault;

  /**
   * @dev Id of the nexus product id
   */
  uint24 public immutable productId;

  /**
   * @dev Id of nexus cover asset that should match the vault asset
   */
  uint8 public immutable coverAsset;

  /**
   * @dev Address of the cover manager contract
   */
  ICoverManager public immutable coverManager;

  /**
   * @dev Maximum amount of assets that can be managed by the vault.
   * Helps to protect the growth of the vault and make sure all deposited assets can be invested and insured.
   * Used to calculate the available amount for new deposits.
   */
  uint256 public maxAssetsLimit;

  /**
   * @dev Amount of assets in the vault that are not invested
   */
  uint256 public idleAssets;

  /**
   * @dev Amount of shares of the underlying vault that represents the invested assets
   */
  uint256 public underlyingVaultShares;

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

  /* ========== Custom Errors ========== */

  error CoveredVault__WithdrawMoreThanMax();
  error CoveredVault__RedeemMoreThanMax();
  error CoveredVault__SendingETHFailed();
  error CoveredVault__InvalidWithdrawAddress();
  error CoveredVault__InvalidBuyCoverAmount();

  /* ========== Constructor ========== */

  /**
   * @dev Set the underlying vault contract, name and symbol of the vault.
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address of admin operator
   * @param _maxAssetsLimit New maximum asset amount limit
   * @param _productId id of covered product
   * @param _coverAsset id of nexus cover asset
   * @param _coverManager address of cover manager contract
   * @param _depositFee Fee for new deposits
   * @param _managementFee Fee for managed assets
   */
  constructor(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit,
    uint24 _productId,
    uint8 _coverAsset,
    ICoverManager _coverManager,
    uint256 _depositFee,
    uint256 _managementFee
  ) SafeERC4626(IERC20(_underlyingVault.asset()), _name, _symbol) FeeManager(_admin, _depositFee, _managementFee) {
    underlyingVault = _underlyingVault;
    maxAssetsLimit = _maxAssetsLimit;
    productId = _productId;
    coverAsset = _coverAsset;
    coverManager = _coverManager;
  }

  /* ========== User methods ========== */

  /** @dev See {IERC4626-deposit}. */
  function deposit(uint256 _assets, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets) = _maxDeposit(_receiver);
    if (_assets > maxAvailableDeposit) revert BaseERC4626__DepositMoreThanMax();

    _updateAssets();

    uint256 fee = _calculateDepositFee(_assets);
    uint256 newVaultAssets = _assets - fee;

    uint256 shares = _convertToShares(newVaultAssets, Math.Rounding.Down, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, _assets, shares);

    idleAssets += newVaultAssets;

    _accrueDepositFees(address(asset()), fee);

    return shares;
  }

  /** @dev See {IERC4626-mint}. */
  function mint(uint256 _shares, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableMint, uint256 vaultTotalAssets) = _maxMint(_receiver);
    if (_shares > maxAvailableMint) revert BaseERC4626__MintMoreThanMax();

    _updateAssets();

    // Calculate the amount of assets that will be accounted for the vault for the shares
    uint256 newVaultAssets = _convertToAssets(_shares, Math.Rounding.Up, vaultTotalAssets);
    // Calculates the amount of assets the user needs to transfer for the required shares and the fees
    uint256 totalAssets = _calculateAmountIncludingDepositFee(newVaultAssets);

    _deposit(_msgSender(), _receiver, totalAssets, _shares);
    uint256 fee = totalAssets - newVaultAssets;

    idleAssets += newVaultAssets;

    _accrueDepositFees(address(asset()), fee);

    return newVaultAssets;
  }

  /** @dev See {IERC4626-withdraw}. */
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) public override whenNotPaused returns (uint256) {
    _updateAssets();

    uint256 vaultTotalAssets = _totalAssets(true, false);
    uint256 userMaxWithdraw = _convertToAssets(balanceOf(_owner), Math.Rounding.Down, vaultTotalAssets);

    if (_assets > userMaxWithdraw) revert CoveredVault__WithdrawMoreThanMax();

    uint256 shares = _convertToShares(_assets, Math.Rounding.Up, vaultTotalAssets);
    _withdraw(_msgSender(), _receiver, _owner, _assets, shares);

    return shares;
  }

  /** @dev See {IERC4626-redeem}. */
  function redeem(uint256 _shares, address _receiver, address _owner) public override whenNotPaused returns (uint256) {
    if (_shares > maxRedeem(_owner)) revert CoveredVault__RedeemMoreThanMax();

    _updateAssets();

    uint256 assets = _convertToAssets(_shares, Math.Rounding.Down, true, false);
    _withdraw(_msgSender(), _receiver, _owner, assets, _shares);

    return assets;
  }

  /** @dev See {IERC4626-previewDeposit}. */
  function previewDeposit(uint256 assets) public view override returns (uint256) {
    uint256 fee = _calculateDepositFee(assets);

    return _convertToShares(assets - fee, Math.Rounding.Down, false, true);
  }

  /** @dev See {IERC4626-previewMint}. */
  function previewMint(uint256 shares) public view override returns (uint256) {
    uint256 sharesIncludingFee = _calculateAmountIncludingDepositFee(shares);

    return _convertToAssets(sharesIncludingFee, Math.Rounding.Up, false, true);
  }

  /** @dev See {IERC4626-previewWithdraw}. */
  function previewWithdraw(uint256 assets) public view override returns (uint256) {
    return _convertToShares(assets, Math.Rounding.Up, true, true);
  }

  /** @dev See {IERC4626-previewRedeem}. */
  function previewRedeem(uint256 shares) public view override returns (uint256) {
    return _convertToAssets(shares, Math.Rounding.Down, true, true);
  }

  /* ========== Admin methods ========== */

  /**
   * @dev Purchase cover for the assets.
   * This contract will be the owner of the NFT representing the cover
   * @param _amount amount of assets to be covered
   * @param _period period of time for the cover. Min valid period in Nexus is 28 days
   * @param _maxPremiumInAsset Max amount of premium to be paid for the cover
   * @param _coverChunkRequests pool allocations for buyCover
   */
  function buyCover(
    uint96 _amount,
    uint32 _period,
    uint256 _maxPremiumInAsset,
    PoolAllocationRequest[] memory _coverChunkRequests
  ) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    // coverId = 0 is the flag to purchase a new cover
    uint256 coverIdParam = 0;

    // If a cover was already purchased and it is not expired, it should edit it
    if (coverId != 0 && !coverManager.isCoverExpired(coverId)) {
      coverIdParam = coverId;
    }

    // ensure already invested assets will remain covered
    uint256 investedAssets = _convertUnderlyingVaultShares(underlyingVaultShares, false);
    if (_amount < investedAssets) revert CoveredVault__InvalidBuyCoverAmount();

    BuyCoverParams memory params = BuyCoverParams({
      coverId: coverIdParam,
      owner: address(this),
      productId: productId,
      coverAsset: coverAsset,
      amount: _amount,
      period: _period,
      maxPremiumInAsset: _maxPremiumInAsset,
      paymentAsset: coverAsset,
      commissionRatio: 0,
      commissionDestination: address(0),
      ipfsData: ""
    });

    uint256 newCoverId = coverManager.buyCover(params, _coverChunkRequests);

    // If a new cover was purchased, update the coverId so next time the current cover is edited
    if (coverId == 0) {
      coverId = newCoverId;
    }
  }

  /**
   * @dev Invest idle vault assets into the underlying vault. Only operator roles can call this method.
   * @param _amount Amount of assets to invest
   */
  function invest(uint256 _amount) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);

    // deposit assets
    IERC20(asset()).approve(address(underlyingVault), _amount);
    uint256 shares = underlyingVault.deposit(_amount, address(this));

    // update vault assets accounting
    idleAssets -= _amount;
    underlyingVaultShares = underlyingVaultShares + shares - fee;

    // update accumulated fees
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(address(underlyingVault), fee);
    }

    emit Invested(_amount, shares, msg.sender);
  }

  /**
   * @dev Uninvest active vault assets out of the underlying vault. Only operator roles can call this method.
   * @param _shares Amount of shares to uninvest
   */
  function uninvest(uint256 _shares) external onlyAdminOrRole(BOT_ROLE) whenNotPaused {
    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);

    // calculate available amount of shares
    uint256 sharesAfterFees = underlyingVaultShares - fee;
    uint256 redeemedShares = Math.min(_shares, sharesAfterFees);

    // redeem shares
    uint256 assets = underlyingVault.redeem(redeemedShares, address(this), address(this));

    // update vault assets accounting
    idleAssets += assets;
    underlyingVaultShares = sharesAfterFees - redeemedShares;

    // update accumulated fees
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(address(underlyingVault), fee);
    }

    emit UnInvested(assets, redeemedShares, msg.sender);
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

  /**
   * @dev Transfers accumulated fees. Only Admin can call this method
   * @param _to receiver of the claimed fees
   */
  function claimFees(address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _claimFees(asset(), address(underlyingVault), _to);
  }

  /**
   * @dev Allows to withdraw deposited assets in cover manager
   * @param _asset asset address to withdraw
   * @param _amount amount to withdraw
   * @param _to address to send withdrawn funds
   */
  function withdrawCoverManagerAssets(
    address _asset,
    uint256 _amount,
    address _to
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_to == address(this)) revert CoveredVault__InvalidWithdrawAddress();

    coverManager.withdraw(_asset, _amount, _to);
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

    if (assets > idleAssets) {
      uint256 amountToWithdraw;

      unchecked {
        amountToWithdraw = assets - idleAssets;
      }

      uint256 sharesBurned = underlyingVault.withdraw(amountToWithdraw, address(this), address(this));
      underlyingVaultShares -= sharesBurned;
      idleAssets = 0;
    } else {
      idleAssets -= assets;
    }

    IERC20(asset()).safeTransfer(receiver, assets);

    emit Withdraw(caller, receiver, owner, assets, shares);
  }

  /** @dev See {IERC4626-maxDeposit}. */
  function _maxDeposit(address) internal view override returns (uint256, uint256) {
    uint256 assets = _totalAssets(false, true);
    if (assets >= maxAssetsLimit) return (0, assets);

    unchecked {
      return (maxAssetsLimit - assets, assets);
    }
  }

  /** @dev See {IERC4626-totalAssets}. */
  function _totalAssets(bool _exact, bool accountForFees) internal view override returns (uint256) {
    uint256 _underlyingVaultShares = underlyingVaultShares;

    if (accountForFees) {
      uint256 fee = _calculateManagementFee(underlyingVaultShares);

      _underlyingVaultShares -= fee;
    }

    uint256 investedAssets = _convertUnderlyingVaultShares(_underlyingVaultShares, _exact);

    return investedAssets + idleAssets;
  }

  /**
   * @dev Calculates the amount of assets that are represented by the shares
   * @param _shares amount of shares
   * @param _exact whether the exact redeemable amount should be calculated or not
   */
  function _convertUnderlyingVaultShares(uint256 _shares, bool _exact) internal view returns (uint256) {
    return _exact == true ? underlyingVault.previewRedeem(_shares) : underlyingVault.convertToAssets(_shares);
  }

  /**
   * @dev Update the assets composition based on the accumulated manager fees
   */
  function _updateAssets() internal override {
    uint256 fee = _calculateManagementFee(underlyingVaultShares);
    underlyingVaultShares -= fee;
    lastManagementFeesUpdate = block.timestamp;

    if (fee > 0) {
      _accrueManagementFees(address(underlyingVault), fee);
    }
  }
}
