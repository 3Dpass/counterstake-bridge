// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IOracle.sol";
import "./Counterstake.sol";
import "./VotedValueAddress.sol";
import "./CounterstakeLibrary.sol";
import "./IERC20WithSymbol.sol";
import "./IPrecompileERC20.sol";
import "./ILocalAsset.sol";


contract ImportWrapper is Counterstake {

	using SafeERC20 for IERC20;

	event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data);
	event BridgeEnacted(address bridgeAddress, address precompileAddress);

	address public oracleAddress;
	
	// Bridge enactment status - once enacted, it can never be changed
	bool public enacted;

	// min price of imported asset in terms of stake asset, to protect against malicious oracles
	// The price is multiplied by 1e20
	uint public min_price20;

	string public home_network;
	string public home_asset;

	// The precompile address to use for this bridge
	address public precompileAddress;
	
	// Batch precompile address (inherited from Counterstake)

	bytes32 private constant base_hash = keccak256(abi.encodePacked("base"));
	bytes32 private constant zx_hash = keccak256(abi.encodePacked("0x0000000000000000000000000000000000000000"));


	constructor (string memory _home_network, string memory _home_asset, address _precompileAddress, address stakeTokenAddr, address oracleAddr, uint16 _counterstake_coef100, uint16 _ratio100, uint _large_threshold, uint[] memory _challenging_periods, uint[] memory _large_challenging_periods) 
	Counterstake(stakeTokenAddr, _counterstake_coef100, _ratio100, _large_threshold, _challenging_periods, _large_challenging_periods) 
	{
		initImportWrapper(_home_network, _home_asset, _precompileAddress, oracleAddr);
	}

	function initImportWrapper(string memory _home_network, string memory _home_asset, address _precompileAddress, address oracleAddr) public
	{
		require(address(governance) == address(0), "already initialized");
		oracleAddress = oracleAddr;
		home_network = _home_network;
		home_asset = _home_asset;
		precompileAddress = _precompileAddress;
		
		// Validate precompile address
		require(_precompileAddress != address(0), "precompile address cannot be zero");
		require(_precompileAddress != CounterstakeLibrary.P3D_PRECOMPILE, "cannot use P3D as image asset");
		require(CounterstakeLibrary.is3DPassERC20Precompile(_precompileAddress), "invalid precompile address");
		
		validateOracle(oracleAddr);
	}

	function setupGovernance(GovernanceFactory governanceFactory, VotedValueFactory votedValueFactory) external {
		setupCounterstakeGovernance(governanceFactory, votedValueFactory, address(this));
		governance.addVotedValue("oracleAddress", votedValueFactory.createVotedValueAddress(governance, oracleAddress, this.validateOracle, this.setOracle));
		governance.addVotedValue("min_price20", votedValueFactory.createVotedValueUint(governance, min_price20, this.validateMinPrice, this.setMinPrice));
	}

	function getOraclePrice(address oracleAddr) view private returns (uint, uint) {
		bytes32 home_asset_hash = keccak256(abi.encodePacked(home_asset));
		string memory symbol = CounterstakeLibrary.getPrecompileSymbol(settings.tokenAddress);
		return IOracle(oracleAddr).getPrice(
			home_asset_hash == base_hash || home_asset_hash == zx_hash ? home_network : home_asset, 
			symbol
		);
	}

	function validateOracle(address oracleAddr) view public {
		require(oracleAddr != address(0), "oracle cannot be zero address");
		require(oracleAddr != CounterstakeLibrary.P3D_PRECOMPILE, "oracle cannot be P3D precompile");
		require(!CounterstakeLibrary.is3DPassERC20Precompile(oracleAddr), "oracle cannot be ERC20 precompile");
		require(CounterstakeLibrary.isContract(oracleAddr), "bad oracle");
		(uint num, uint den) = getOraclePrice(oracleAddr);
		require(num > 0 || den > 0, "no price from oracle");
	}

	function setOracle(address oracleAddr) onlyVotedValueContract external {
		oracleAddress = oracleAddr;
	}

	function validateMinPrice(uint _min_price20) pure external {
		// anything goes
	}

	function setMinPrice(uint _min_price20) onlyVotedValueContract external {
		min_price20 = _min_price20;
	}

	/**
	 * @dev Enacts the bridge by performing all required security checks
	 * Once enacted, the bridge status can never be changed again
	 * This function must be called before any mint/burn operations
	 */
	function enactImportWrapper() external {
		require(!enacted, "Bridge already enacted");
		require(precompileAddress != address(0), "Precompile address not set");
		
		// Check 1: Contract must be the owner of the asset
		require(LocalAsset(precompileAddress).isOwner(address(this)), "Bridge is not owner of asset");
		
		// Check 2: Contract must be the issuer of the asset
		require(LocalAsset(precompileAddress).isIssuer(address(this)), "Bridge is not issuer of asset");
		
		// Check 3: Contract must be the admin of the asset
		require(LocalAsset(precompileAddress).isAdmin(address(this)), "Bridge is not admin of asset");
		
		// Check 4: Contract must be the freezer of the asset
		require(LocalAsset(precompileAddress).isFreezer(address(this)), "Bridge is not freezer of asset");
		
		// Check 5: Asset status must be "Live"
		string memory assetStatus = LocalAsset(precompileAddress).status();
		require(keccak256(abi.encodePacked(assetStatus)) == keccak256(abi.encodePacked("Live")), "Asset status is not Live");
		
		// Check 6: Bridge balance must equal minBalance
		uint256 minBalance = LocalAsset(precompileAddress).minBalance();
		uint256 bridgeBalance = IPrecompileERC20(precompileAddress).balanceOf(address(this));
		require(bridgeBalance == minBalance, "Bridge balance does not equal minBalance");
		
		// All checks passed - enact the bridge
		enacted = true;
		emit BridgeEnacted(address(this), precompileAddress);
	}

	// repatriate
	function transferToHomeChain(string memory home_address, string memory data, uint amount, uint reward) external {
		require(enacted, "Bridge must be enacted before operations");
		// Burn tokens from the precompile
		require(LocalAsset(precompileAddress).burn(msg.sender, amount), "burn from precompile failed");
		emit NewRepatriation(msg.sender, amount, reward, home_address, data);
	}

	function getRequiredStake(uint amount) public view override returns (uint) {
		(uint num, uint den) = getOraclePrice(oracleAddress);
		require(num > 0, "price num must be positive");
		require(den > 0, "price den must be positive");
		uint stake_in_image_asset = amount * settings.ratio100 / 100;
		return Math.max(Math.max(stake_in_image_asset * num / den, stake_in_image_asset * min_price20 / 1e20), settings.min_stake);
	}

	function sendWithdrawals(address payable to_address, uint paid_claimed_amount, uint won_stake) internal override {
		require(enacted, "Bridge must be enacted before operations");
		if (paid_claimed_amount > 0){
			// Mint tokens to the user via precompile
			require(LocalAsset(precompileAddress).mint(to_address, paid_claimed_amount), "mint to precompile failed");
		}
		transferTokens(settings.tokenAddress, to_address, won_stake);
	}
     
    function receiveMoneyInClaim(uint stake, uint paid_amount) internal override {
        require(enacted, "Bridge must be enacted before operations");
         if (paid_amount > 0)
		    // Burn image tokens from the assistant account
            require(LocalAsset(precompileAddress).burn(msg.sender, paid_amount), "burn from precompile failed");
        receiveStakeAsset(stake);
    }

    function sendToClaimRecipient(address payable to_address, uint paid_amount) internal override {
        require(enacted, "Bridge must be enacted before operations");
            // Mint image tokens to the user after assistant calim
            require(LocalAsset(precompileAddress).mint(to_address, paid_amount), "mint to precompile failed");
    }

} 