// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { BuyCoverParams, PoolAllocationRequest, ICover } from "./interfaces/ICover.sol";
import { ICoverManager } from "./interfaces/ICoverManager.sol";
import { FeeManager } from "./vault/FeeManager.sol";
import { SafeERC4626 } from "./vault/SafeERC4626.sol";

/**
 * @title CoveredVault
 * @dev An ERC-4626 vault that invest the assets in an underlying ERC-4626 vault. Invested assets are protected by
 * purchasing coverage on Nexus Mutual.
 */
contract CoveredVault is SafeERC4626, FeeManager {
  using SafeERC20 for IERC20;
  using Math for uint256;

  /* ========== Constants ========== */

  /**
   * @dev Rate threshold denominator 100% with two decimals
   */
  uint256 public constant RATE_THRESHOLD_DENOMINATOR = 100_00;

  /**
   * @dev Precision for the latest underlying vault exchange rate
   */
  uint256 public constant RATE_UNIT = 1 ether;

  /* ========== Immutable Variables ========== */

  /**
   * @dev Address of the underlying vault
   */
  IERC4626 public immutable underlyingVault;

  /**
   * @dev Id of the Nexus Mutual product that the vault purchases cover for
   */
  uint24 public immutable productId;

  /**
   * @dev Id of Nexus Cover asset. Must represent the same asset that the vault's underlying asset
   */
  uint8 public immutable coverAsset;

  /**
   * @dev Address of the cover manager contract
   */
  ICoverManager public immutable coverManager;

  /* ========== Contract Variables ========== */

  /**
   * @dev Percentage rate threshold of the difference between the previous and the current underlying vault exchange rate
   */
  uint256 public uvRateThreshold;

  /**
   * @dev Tracks the latest underlying vault exchange rate with RATE_UNIT precision
   */
  uint256 public latestUvRate;

  /**
   * @dev Id of the current purchased cover in Nexus Mutual
   */
  uint256 public coverId;

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
   * @dev Emitted when a cover is purchased
   */
  event CoverBought(address caller, uint256 coverId, uint256 amount, uint256 period);

  /**
   * @dev Emitted when a cover is redeemed
   */
  event CoverRedeemed(
    address caller,
    uint256 coverId,
    uint256 incidentId,
    uint256 segmentId,
    uint256 depeggedTokens,
    uint256 payoutAmount
  );

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

  /**
   * @dev Emitted when the underlying vault rate threshold is updated
   */
  event RateThresholdUpdated(uint256 newThreshold);

  /**
   * @dev Emitted when the latest underlying vault rate is updated
   */
  event UnderlyingVaultRateUpdated(uint256 newRate);

  /* ========== Custom Errors ========== */

  error CoveredVault_DepositMoreThanMax();
  error CoveredVault_MintMoreThanMax();
  error CoveredVault_WithdrawMoreThanMax();
  error CoveredVault_RedeemMoreThanMax();
  error CoveredVault_SendingETHFailed();
  error CoveredVault_InvalidWithdrawAddress();
  error CoveredVault_InvalidBuyCoverAmount();
  error CoveredVault_InvestExceedsCoverAmount();
  error CoveredVault_UnderlyingVaultBadRate();
  error CoveredVault_RateThresholdOutOfBound();

  /* ========== Constructor ========== */

  /**
   * @dev Initializes the contract variables
   * @param _underlyingVault Underlying vault ERC4626-compatible contract
   * @param _name Name of the vault
   * @param _symbol Symbol of the vault
   * @param _admin address of admin operator
   * @param _maxAssetsLimit Maximum asset amount limit
   * @param _uvRateThreshold Underlying vault exchange rate difference threshold
   * @param _productId id of covered product
   * @param _coverAsset id of nexus cover asset
   * @param _coverManager address of cover manager contract
   * @param _depositFee Fee for new deposits
   * @param _managementFee Fee for invested assets
   */
  constructor(
    IERC4626 _underlyingVault,
    string memory _name,
    string memory _symbol,
    address _admin,
    uint256 _maxAssetsLimit,
    uint256 _uvRateThreshold,
    uint24 _productId,
    uint8 _coverAsset,
    ICoverManager _coverManager,
    uint256 _depositFee,
    uint256 _managementFee
  ) SafeERC4626(IERC20(_underlyingVault.asset()), _name, _symbol) FeeManager(_admin, _depositFee, _managementFee) {
    if (_uvRateThreshold > RATE_THRESHOLD_DENOMINATOR) revert CoveredVault_RateThresholdOutOfBound();

    underlyingVault = _underlyingVault;
    maxAssetsLimit = _maxAssetsLimit;
    uvRateThreshold = _uvRateThreshold;
    productId = _productId;
    coverAsset = _coverAsset;
    coverManager = _coverManager;

    emit RateThresholdUpdated(_uvRateThreshold);
  }

  /* ========== View methods ========== */

  /**
   * @dev Returns the total amount of the underlying asset that is “managed” by Vault.
   *
   * - SHOULD include any compounding that occurs from yield.
   * - MUST be inclusive of any fees that are charged against assets in the Vault.
   * - MUST NOT revert.
   * @return Total amount of underlying assets
   */
  function totalAssets() public view override returns (uint256) {
    (uint256 totalVaultAssets, ) = _totalAssets(true, true);
    return totalVaultAssets;
  }

  /**
   * @dev Returns the amount of shares that the Vault would exchange for the amount of assets provided, in an ideal
   * scenario where all the conditions are met.
   *
   * - MUST NOT be inclusive of any fees that are charged against assets in the Vault.
   * - MUST NOT show any variations depending on the caller.
   * - MUST NOT reflect slippage or other on-chain conditions, when performing the actual exchange.
   * - MUST NOT revert.
   * @param _assets Amount of assets
   * @return Amount of shares
   */
  function convertToShares(uint256 _assets) public view override returns (uint256) {
    return _convertToShares(_assets, Math.Rounding.Down, false, false);
  }

  /**
   * @dev Returns the amount of assets that the Vault would exchange for the amount of shares provided, in an ideal
   * scenario where all the conditions are met.
   *
   * - MUST NOT be inclusive of any fees that are charged against assets in the Vault.
   * - MUST NOT show any variations depending on the caller.
   * - MUST NOT reflect slippage or other on-chain conditions, when performing the actual exchange.
   * - MUST NOT revert.
   *
   * @param _shares Amount of shares
   * @return Amount of assets
   */
  function convertToAssets(uint256 _shares) public view override returns (uint256) {
    (uint256 assets, ) = _convertToAssets(_shares, Math.Rounding.Down, false, false);
    return assets;
  }

  /**
   * @dev Returns the maximum amount of the underlying asset that can be deposited into the Vault for the receiver,
   * through a deposit call.
   *
   * - MUST return a limited value if receiver is subject to some deposit limit.
   * - MUST NOT revert.
   * @param _receiver Address of the receiver
   * @return Maximum amount of the underlying asset
   */
  function maxDeposit(address _receiver) public view virtual override returns (uint256) {
    (uint256 maxAmount, , ) = _maxDeposit(_receiver);

    return maxAmount;
  }

  /**
   * @dev Returns the maximum amount of the Vault shares that can be minted for the receiver, through a mint call.
   * - MUST return a limited value if receiver is subject to some mint limit.
   * - MUST NOT revert.
   * @param _receiver Address of the receiver
   * @return Maximum amount of the vault shares
   */
  function maxMint(address _receiver) public view virtual override returns (uint256) {
    (uint256 maxShares, , ) = _maxMint(_receiver);

    return maxShares;
  }

  /**
   * @dev Allows an on-chain or off-chain user to simulate the effects of their deposit at the current block, given
   * current on-chain conditions.
   *
   * - MUST return as close to and no more than the exact amount of Vault shares that would be minted in a deposit
   *   call in the same transaction. I.e. deposit should return the same or more shares as previewDeposit if called
   *   in the same transaction.
   * - MUST NOT account for deposit limits like those returned from maxDeposit and should always act as though the
   *   deposit would be accepted, regardless if the user has enough tokens approved, etc.
   * - MUST be inclusive of deposit fees. Integrators should be aware of the existence of deposit fees.
   * - MUST NOT revert.
   * @param _assets Amount of assets to deposit
   * @return Amount of shares
   */
  function previewDeposit(uint256 _assets) public view override returns (uint256) {
    uint256 fee = _calculateDepositFee(_assets);

    return _convertToShares(_assets - fee, Math.Rounding.Down, false, true);
  }

  /**
   * @dev Allows an on-chain or off-chain user to simulate the effects of their mint at the current block, given
   * current on-chain conditions.
   *
   * - MUST return as close to and no fewer than the exact amount of assets that would be deposited in a mint call
   *   in the same transaction. I.e. mint should return the same or fewer assets as previewMint if called in the
   *   same transaction.
   * - MUST NOT account for mint limits like those returned from maxMint and should always act as though the mint
   *   would be accepted, regardless if the user has enough tokens approved, etc.
   * - MUST be inclusive of deposit fees. Integrators should be aware of the existence of deposit fees.
   * - MUST NOT revert.
   * @param _shares Amount of shares to mint
   * @return Amount of assets
   */
  function previewMint(uint256 _shares) public view override returns (uint256) {
    uint256 sharesIncludingFee = _calculateAmountIncludingDepositFee(_shares);

    (uint256 assets, ) = _convertToAssets(sharesIncludingFee, Math.Rounding.Up, false, true);

    return assets;
  }

  /**
   * @dev Returns the maximum amount of the underlying asset that can be withdrawn from the owner balance in the
   * Vault, through a withdraw call.
   *
   * - MUST return a limited value if owner is subject to some withdrawal limit or timelock.
   * - MUST NOT revert.
   * @param _owner Address of the owner
   * @return Maximum amount of assets
   */
  function maxWithdraw(address _owner) public view virtual override returns (uint256) {
    (uint256 assets, ) = _convertToAssets(balanceOf(_owner), Math.Rounding.Down, true, true);

    return assets;
  }

  /**
   * @dev Allows an on-chain or off-chain user to simulate the effects of their withdrawal at the current block,
   * given current on-chain conditions.
   *
   * - MUST return as close to and no fewer than the exact amount of Vault shares that would be burned in a withdraw
   *   call in the same transaction. I.e. withdraw should return the same or fewer shares as previewWithdraw if
   *   called
   *   in the same transaction.
   * - MUST NOT account for withdrawal limits like those returned from maxWithdraw and should always act as though
   *   the withdrawal would be accepted, regardless if the user has enough shares, etc.
   * - MUST be inclusive of withdrawal fees. Integrators should be aware of the existence of withdrawal fees.
   * - MUST NOT revert.
   * @param _assets Amount of assets
   * @return Amount of shares
   */
  function previewWithdraw(uint256 _assets) public view override returns (uint256) {
    return _convertToShares(_assets, Math.Rounding.Up, true, true);
  }

  /**
   * @dev Allows an on-chain or off-chain user to simulate the effects of their redemption at the current block,
   * given current on-chain conditions.
   *
   * - MUST return as close to and no more than the exact amount of assets that would be withdrawn in a redeem call
   *   in the same transaction. I.e. redeem should return the same or more assets as previewRedeem if called in the
   *   same transaction.
   * - MUST NOT account for redemption limits like those returned from maxRedeem and should always act as though the
   *   redemption would be accepted, regardless if the user has enough shares, etc.
   * - MUST be inclusive of withdrawal fees. Integrators should be aware of the existence of withdrawal fees.
   * - MUST NOT revert.
   * @param _shares Amount of shares
   * @return Amount of assets
   */
  function previewRedeem(uint256 _shares) public view override returns (uint256) {
    (uint256 assets, ) = _convertToAssets(_shares, Math.Rounding.Down, true, true);

    return assets;
  }

  /* ========== User methods ========== */

  /**
   * @dev Mints Vault shares to receiver by depositing exactly amount of underlying tokens.
   * Require pre-approval of the Vault with the Vault’s underlying asset token.
   * @param _assets Amount of underlying assets
   * @param _receiver Address of the receiver
   * @return Amount of minted shares
   */
  function deposit(uint256 _assets, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets, uint256 newUVRate) = _maxDeposit(_receiver);
    if (_assets > maxAvailableDeposit) revert CoveredVault_DepositMoreThanMax();

    _validateUnderlyingVaultExchangeRate(newUVRate);

    _updateAssets();

    uint256 fee = _calculateDepositFee(_assets);
    uint256 newVaultAssets = _assets - fee;

    uint256 shares = _convertToShares(newVaultAssets, Math.Rounding.Down, vaultTotalAssets);
    _deposit(_msgSender(), _receiver, _assets, shares);

    idleAssets += newVaultAssets;

    _accrueDepositFees(address(asset()), fee);

    return shares;
  }

  /**
   * @dev Mints exactly Vault shares to receiver by depositing amount of underlying tokens.
   * Require pre-approval of the Vault with the Vault’s underlying asset token.
   * @param _shares Amount of shares to mint
   * @param _receiver Address of the receiver
   * @return Amount of underlying assets
   */
  function mint(uint256 _shares, address _receiver) public override whenNotPaused returns (uint256) {
    (uint256 maxAvailableMint, uint256 vaultTotalAssets, uint256 newUVRate) = _maxMint(_receiver);
    if (_shares > maxAvailableMint) revert CoveredVault_MintMoreThanMax();

    _validateUnderlyingVaultExchangeRate(newUVRate);

    _updateAssets();

    // Calculate the amount of assets that will be accounted for the vault for the shares
    uint256 newVaultAssets = _convertToAssets(_shares, Math.Rounding.Up, vaultTotalAssets);
    // Calculates the amount of assets the user needs to transfer for the required shares and the fees
    uint256 depositAssets = _calculateAmountIncludingDepositFee(newVaultAssets);

    _deposit(_msgSender(), _receiver, depositAssets, _shares);
    uint256 fee = depositAssets - newVaultAssets;

    idleAssets += newVaultAssets;

    _accrueDepositFees(address(asset()), fee);

    return newVaultAssets;
  }

  /**
   * @dev Burns shares from owner and sends exactly assets of underlying tokens to receiver.
   * @param _assets Amount of underlying tokens to withdraw
   * @param _receiver Address of the receiver
   * @return Amount of burned shares
   */
  function withdraw(
    uint256 _assets,
    address _receiver,
    address _owner
  ) public override whenNotPaused returns (uint256) {
    _updateAssets();

    (uint256 vaultTotalAssets, uint256 newUVRate) = _totalAssets(true, false);
    uint256 userMaxWithdraw = _convertToAssets(balanceOf(_owner), Math.Rounding.Down, vaultTotalAssets);

    if (_assets > userMaxWithdraw) revert CoveredVault_WithdrawMoreThanMax();

    _validateUnderlyingVaultExchangeRate(newUVRate);

    uint256 shares = _convertToShares(_assets, Math.Rounding.Up, vaultTotalAssets);
    _withdraw(_msgSender(), _receiver, _owner, _assets, shares);

    return shares;
  }

  /**
   * @dev Burns exactly shares from owner and sends assets of underlying tokens to receiver.
   * @param _shares Amount of shares to burn
   * @param _receiver Address of the receiver
   * @return Amount of underlying assets withdrawn
   */
  function redeem(uint256 _shares, address _receiver, address _owner) public override whenNotPaused returns (uint256) {
    if (_shares > maxRedeem(_owner)) revert CoveredVault_RedeemMoreThanMax();

    _updateAssets();

    (uint256 assets, uint256 newUVRate) = _convertToAssets(_shares, Math.Rounding.Down, true, false);

    _validateUnderlyingVaultExchangeRate(newUVRate);

    _withdraw(_msgSender(), _receiver, _owner, assets, _shares);

    return assets;
  }

  /* ========== Admin/Operator Cover methods ========== */

  /**
   * @dev Purchase cover for the assets. Can be called multiple times to update it as needed.
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
  ) external onlyAdminOrRole(OPERATOR_ROLE) whenNotPaused {
    // coverId = 0 is the flag to purchase a new cover
    uint256 coverIdParam = 0;

    // If a cover was already purchased and it is not expired, it should edit it
    if (coverId != 0 && !coverManager.isCoverExpired(coverId)) {
      coverIdParam = coverId;
    }

    // ensure already invested assets will remain covered
    uint256 investedAssets = _convertUnderlyingVaultShares(underlyingVaultShares, false);
    if (_amount < investedAssets) revert CoveredVault_InvalidBuyCoverAmount();

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
    if (coverId != newCoverId) {
      coverId = newCoverId;
    }

    emit CoverBought(msg.sender, newCoverId, _amount, _period);
  }

  /**
   * @dev Allows using the purchased cover to exchange the depegged tokens for the cover asset
   * @param _incidentId Index of the incident in YieldTokenIncidents
   * @param _segmentId Index of the cover's segment that's eligible for redemption
   * @param _depeggedTokens The amount of depegged tokens to be swapped for the cover asset
   * @param _optionalParams extra params
   */
  function redeemCover(
    uint104 _incidentId,
    uint256 _segmentId,
    uint256 _depeggedTokens,
    bytes calldata _optionalParams
  ) external {
    address cover = coverManager.cover();

    ICover(cover).coverNFT().approve(address(coverManager), coverId);
    underlyingVault.approve(address(coverManager), _depeggedTokens);

    (uint256 payoutAmount, ) = coverManager.redeemCover(
      _incidentId,
      uint32(coverId),
      _segmentId,
      _depeggedTokens,
      payable(address(this)),
      _optionalParams
    );

    underlyingVaultShares -= _depeggedTokens;
    idleAssets += payoutAmount;

    emit CoverRedeemed(msg.sender, coverId, _incidentId, _segmentId, _depeggedTokens, payoutAmount);
  }

  /**
   * @dev Allows to withdraw deposited assets in cover manager
   * @param _asset asset address to withdraw
   * @param _amount amount to withdraw
   * @param _to address to send withdrawn assets
   */
  function withdrawCoverManagerAssets(
    address _asset,
    uint256 _amount,
    address _to
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_to == address(this)) revert CoveredVault_InvalidWithdrawAddress();

    coverManager.withdraw(_asset, _amount, _to);
  }

  /* ========== Admin/Operator Underlying Vault methods ========== */

  /**
   * @dev Invest idle vault assets into the underlying vault. Only operator roles can call this method.
   * @param _amount Amount of assets to invest
   */
  function invest(uint256 _amount) external onlyAdminOrRole(OPERATOR_ROLE) whenNotPaused {
    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);

    uint256 investedAssets = _convertUnderlyingVaultShares(underlyingVaultShares - fee, false);
    uint96 coveredAmount = coverManager.getActiveCoverAmount(coverId);

    if (investedAssets + _amount > coveredAmount) revert CoveredVault_InvestExceedsCoverAmount();

    // deposit assets
    IERC20(asset()).approve(address(underlyingVault), _amount);
    uint256 shares = underlyingVault.deposit(_amount, address(this));

    uint256 newUVRate = _getUnderlyingVaultExchangeRate(_amount, shares);
    _validateUnderlyingVaultExchangeRate(newUVRate);

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
  function uninvest(uint256 _shares) external onlyAdminOrRole(OPERATOR_ROLE) whenNotPaused {
    // calculate management fees
    uint256 fee = _calculateManagementFee(underlyingVaultShares);

    // calculate available amount of shares
    uint256 sharesAfterFees = underlyingVaultShares - fee;
    uint256 redeemedShares = Math.min(_shares, sharesAfterFees);

    // redeem shares
    uint256 assets = underlyingVault.redeem(redeemedShares, address(this), address(this));

    uint256 newUVRate = _getUnderlyingVaultExchangeRate(assets, redeemedShares);
    _validateUnderlyingVaultExchangeRate(newUVRate);

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

  /* ========== Admin methods ========== */

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
   * @dev Sets the new percentage rate threshold
   * @param _newThreshold new threshold value
   */
  function setUnderlyingVaultRateThreshold(uint256 _newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_newThreshold > RATE_THRESHOLD_DENOMINATOR) revert CoveredVault_RateThresholdOutOfBound();

    uvRateThreshold = _newThreshold;

    emit RateThresholdUpdated(_newThreshold);
  }

  /**
   * @dev Transfers accumulated fees. Only Admin can call this method
   * @param _to receiver of the claimed fees
   */
  function claimFees(address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _claimFees(asset(), address(underlyingVault), _to);
  }

  /* ========== Internal methods ========== */

  /**
   * @dev Withdraw/redeem common workflow.
   * @param _caller Address of the caller
   * @param _receiver Address of the receiver
   * @param _owner Address of the shares owner
   * @param _assets Amount of assets to withdraw
   * @param _shares Amount of shares to burn
   */
  function _withdraw(
    address _caller,
    address _receiver,
    address _owner,
    uint256 _assets,
    uint256 _shares
  ) internal override {
    if (_caller != _owner) {
      _spendAllowance(_owner, _caller, _shares);
    }

    _burn(_owner, _shares);

    if (_assets > idleAssets) {
      uint256 amountToWithdraw;

      unchecked {
        amountToWithdraw = _assets - idleAssets;
      }

      uint256 sharesBurned = underlyingVault.withdraw(amountToWithdraw, address(this), address(this));
      underlyingVaultShares -= sharesBurned;
      idleAssets = 0;
    } else {
      idleAssets -= _assets;
    }

    IERC20(asset()).safeTransfer(_receiver, _assets);

    emit Withdraw(_caller, _receiver, _owner, _assets, _shares);
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

  /**
   * @dev Validates the new underlying vault exchange rate
   * @param _newRate the new exchange rate
   */
  function _validateUnderlyingVaultExchangeRate(uint256 _newRate) internal {
    if (latestUvRate != 0 && _newRate < latestUvRate) {
      uint256 minNewRate = latestUvRate - (latestUvRate * uvRateThreshold) / RATE_THRESHOLD_DENOMINATOR;

      if (_newRate < minNewRate) revert CoveredVault_UnderlyingVaultBadRate();
    }

    if (_newRate != latestUvRate) {
      latestUvRate = _newRate;

      emit UnderlyingVaultRateUpdated(_newRate);
    }
  }

  /**
   * @dev Returns the maximum amount of the underlying asset that can be deposited into the Vault
   * @return Maximum amount of the underlying asset to deposit
   * @return Total amount of assets managed by the vault
   * @return The new underlying vault exchange rate
   */
  function _maxDeposit(address) internal view returns (uint256, uint256, uint256) {
    (uint256 assets, uint256 newUVRate) = _totalAssets(false, true);
    if (assets >= maxAssetsLimit) return (0, assets, newUVRate);

    unchecked {
      return (maxAssetsLimit - assets, assets, newUVRate);
    }
  }

  /**
   * @dev Returns the total assets managed by the vault
   * @param _exact Whether the exact redeemable amount should be calculated or not
   * @param _accountForFees Whether management fe should be accounted or not to avoid re-calculating it
   * @return Total amount of assets managed by the vault
   * @return The new underlying vault exchange rate
   */
  function _totalAssets(bool _exact, bool _accountForFees) internal view returns (uint256, uint256) {
    uint256 _underlyingVaultShares = underlyingVaultShares;

    if (_accountForFees) {
      uint256 fee = _calculateManagementFee(underlyingVaultShares);

      _underlyingVaultShares -= fee;
    }

    uint256 investedAssets = _convertUnderlyingVaultShares(_underlyingVaultShares, _exact);
    uint256 newUVRate = _getUnderlyingVaultExchangeRate(investedAssets, _underlyingVaultShares);

    return (investedAssets + idleAssets, newUVRate);
  }

  /**
   * @dev Calculates the exchange rate of the amount of assets that are represented by the shares
   * @param _assets amount of assets
   * @param _shares amount of shares
   * @return the exchange rate in RATE_UNIT precision
   */
  function _getUnderlyingVaultExchangeRate(uint256 _assets, uint256 _shares) internal pure returns (uint256) {
    return _shares > 0 ? (_assets * RATE_UNIT) / _shares : 0;
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
   * @dev Returns the maximum amount of the Vault shares that can be minted for the receiver
   * @param _receiver Address of the receiver
   * @return Maximum amount of the shares to mint
   * @return Total amount of assets managed by the vault
   * @return The new underlying vault exchange rate
   */
  function _maxMint(address _receiver) internal view returns (uint256, uint256, uint256) {
    (uint256 maxAvailableDeposit, uint256 vaultTotalAssets, uint256 newUVRate) = _maxDeposit(_receiver);
    uint256 maxAvailableMint = _convertToShares(maxAvailableDeposit, Math.Rounding.Down, vaultTotalAssets);

    return (maxAvailableMint, vaultTotalAssets, newUVRate);
  }

  /**
   * @dev Internal conversion function (from assets to shares) with support for rounding direction.
   * Will revert if assets > 0, totalSupply > 0 and totalAssets = 0. That corresponds to a case where any asset
   * would represent an infinite amount of shares.
   * @param _assets Amount of assets
   * @param _rounding Rounding direction
   * @param _calculatedTotalAssets Total assets managed by the vault
   * @return The amount of shares
   */
  function _convertToShares(
    uint256 _assets,
    Math.Rounding _rounding,
    uint256 _calculatedTotalAssets
  ) internal view returns (uint256) {
    uint256 supply = totalSupply();
    return
      (_assets == 0 || supply == 0)
        ? _initialConvertToShares(_assets, _rounding)
        : _assets.mulDiv(supply, _calculatedTotalAssets, _rounding);
  }

  /**
   * @dev Internal conversion function (from assets to shares) with support for rounding direction.
   * @param _assets Amount of assets
   * @param _rounding Rounding direction
   * @param _exact Whether the exact redeemable amount should be calculated or not
   * @param _accountForFees Whether management fe should be accounted or not to avoid re-calculating it
   * @return The amount of shares
   */
  function _convertToShares(
    uint256 _assets,
    Math.Rounding _rounding,
    bool _exact,
    bool _accountForFees
  ) internal view returns (uint256) {
    (uint256 totalVaultAssets, ) = _totalAssets(_exact, _accountForFees);
    return _convertToShares(_assets, _rounding, totalVaultAssets);
  }

  /**
   * @dev Internal conversion function (from shares to assets) with support for rounding direction.
   * @param _shares The amount of shares
   * @param _rounding Rounding direction
   * @param _calculatedTotalAssets Total assets managed by the vault
   * @return Amount of assets
   */
  function _convertToAssets(
    uint256 _shares,
    Math.Rounding _rounding,
    uint256 _calculatedTotalAssets
  ) internal view returns (uint256) {
    uint256 supply = totalSupply();
    return
      (supply == 0)
        ? _initialConvertToAssets(_shares, _rounding)
        : _shares.mulDiv(_calculatedTotalAssets, supply, _rounding);
  }

  /**
   * @dev Internal conversion function (from shares to assets) with support for rounding direction.
   * @param _shares The amount of shares
   * @param _rounding Rounding direction
   * @param _exact Whether the exact redeemable amount should be calculated or not
   * @param _accountForFees Whether management fe should be accounted or not to avoid re-calculating it
   * @return Amount of assets
   */
  function _convertToAssets(
    uint256 _shares,
    Math.Rounding _rounding,
    bool _exact,
    bool _accountForFees
  ) internal view returns (uint256, uint256) {
    (uint256 totalVaultAssets, uint256 newUVRate) = _totalAssets(_exact, _accountForFees);

    uint256 assets = _convertToAssets(_shares, _rounding, totalVaultAssets);

    return (assets, newUVRate);
  }
}
