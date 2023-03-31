// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { ICover, BuyCoverParams, PoolAllocationRequest, Product, CoverData, ProductParam, CoverSegment, ProductType, ProductInitializationParams } from "./../interfaces/ICover.sol";
import { IPool } from "./../interfaces/IPool.sol";
import { ICoverNFT } from "./../interfaces/ICoverNFT.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract CoverMock is ICover {
  address public pool;
  ICoverNFT public coverNFT;

  uint256 public constant PREMIUM_DENOMINATOR = 1e4;
  uint256 public premium = 100; // 1%
  uint256 public coverId = 0;
  bool public mockSegments = true;

  Product[] internal _products;
  mapping(uint256 => CoverData) internal _coverData;
  mapping(uint256 => CoverSegment[]) internal segments;

  error CoverMock_PremiumTooHigh();
  error CoverMock_PremiumAmountHigherThanMaxPremium();
  error CoverMock_InsufficientETHForPremium();
  error CoverMock_EthSendFailed();

  constructor(address _pool, address _coverNFT) {
    pool = _pool;
    coverNFT = ICoverNFT(_coverNFT);
  }

  function coverData(uint256 _coverId) external view returns (CoverData memory) {
    return _coverData[_coverId];
  }

  function products(uint256 _id) external view returns (Product memory) {
    return _products[_id];
  }

  function setPremium(uint256 _premium) public {
    if (_premium > PREMIUM_DENOMINATOR) revert CoverMock_PremiumTooHigh();
    premium = _premium;
  }

  function setProducts(ProductParam[] calldata productParams) external {
    for (uint i = 0; i < productParams.length; i++) {
      ProductParam calldata param = productParams[i];
      Product calldata product = param.product;

      _products.push(product);
    }
  }

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata /* coverChunkRequests */
  ) external payable returns (uint256) {
    uint256 amountToPay = ((params.amount * premium) / PREMIUM_DENOMINATOR);
    if (amountToPay > params.maxPremiumInAsset) {
      revert CoverMock_PremiumAmountHigherThanMaxPremium();
    }

    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    if (params.coverId == 0) {
      // new cover
      uint256 newCoverId = coverId + 1;
      ICoverNFT(coverNFT).mint(params.owner, newCoverId);
      _coverData[newCoverId] = CoverData(params.productId, params.coverAsset, 0 /* amountPaidOut */);
    }

    bool isETH = params.paymentAsset == 0;

    if (isETH) {
      if (amountToPay > msg.value) {
        revert CoverMock_InsufficientETHForPremium();
      }
      uint256 remaining = msg.value - amountToPay;
      if (remaining > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(msg.sender).call{ value: remaining }("");
        if (!success) revert CoverMock_EthSendFailed();
      }
    } else {
      SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), amountToPay);
    }

    return (params.coverId == 0) ? ++coverId : params.coverId;
  }

  function setMockSegments(bool _value) public {
    mockSegments = _value;
  }

  function setSegments(uint256 _coverId, CoverSegment[] calldata _segments) public {
    for (uint i = 0; i < _segments.length; i++) {
      segments[_coverId].push(_segments[i]);
    }
  }

  function coverSegmentsCount(uint256 _coverId) external view returns (uint256) {
    if (mockSegments) {
      return 1;
    }

    return segments[_coverId].length;
  }

  function coverSegmentWithRemainingAmount(
    uint256 _coverId,
    uint256 _segmentId
  ) external view returns (CoverSegment memory) {
    if (mockSegments) {
      return CoverSegment(type(uint96).max, uint32(block.timestamp - 10 days), 30 days, 0, 0, 0);
    }

    return segments[_coverId][_segmentId];
  }

  // Used for integration tests only
  function productsCount() external view returns (uint) {
    // solhint-disable-previous-line no-empty-blocks
  }

  // Used for integration tests only
  function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] calldata productInitParams,
    string calldata ipfsDescriptionHash
  ) external returns (uint poolId, address stakingPoolAddress) {
    // solhint-disable-previous-line no-empty-blocks
  }

  // Used for integration tests only
  function stakingPool(uint poolId) external view returns (address) {
    // solhint-disable-previous-line no-empty-blocks
  }
}
