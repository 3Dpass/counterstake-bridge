// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

contract BridgesRegistry {
    
    enum BridgeType { Export, Import }
    enum AssistantType { Import, Export }
    
    struct Bridge {
        address bridgeAddress;
        BridgeType bridgeType;
        uint256 createdAt;
        bool exists;
    }
    
    struct Assistant {
        address assistantAddress;
        AssistantType assistantType;
        uint256 createdAt;
        bool exists;
    }
    
    // Mapping from bridge address to bridge info
    mapping(address => Bridge) public bridges;
    
    // Mapping from assistant address to assistant info
    mapping(address => Assistant) public assistants;
    
    // Arrays to store all bridge and assistant addresses for enumeration
    address[] public allBridges;
    address[] public allAssistants;
    
    // Events
    event BridgeRegistered(address indexed bridgeAddress, BridgeType bridgeType, uint256 createdAt);
    event AssistantRegistered(address indexed assistantAddress, AssistantType assistantType, uint256 createdAt);
    
    // Modifier to ensure only factories can register
    modifier onlyFactory() {
        require(msg.sender == counterstakeFactory || msg.sender == assistantFactory, "Only factories can register");
        _;
    }
    
    address public counterstakeFactory;
    address public assistantFactory;
    
    constructor() {
        // Factories will be set after deployment to avoid circular dependency
    }
    
    /**
     * @dev Set the factory addresses (can only be called once)
     * @param _counterstakeFactory The address of the CounterstakeFactory
     * @param _assistantFactory The address of the AssistantFactory
     */
    function setFactories(address _counterstakeFactory, address _assistantFactory) external {
        require(counterstakeFactory == address(0) && assistantFactory == address(0), "Factories already set");
        require(_counterstakeFactory != address(0) && _assistantFactory != address(0), "Invalid factory addresses");
        
        counterstakeFactory = _counterstakeFactory;
        assistantFactory = _assistantFactory;
    }
    
    /**
     * @dev Register a new bridge
     * @param bridgeAddress The address of the bridge contract
     * @param bridgeType The type of bridge (Export or Import)
     */
    function registerBridge(address bridgeAddress, BridgeType bridgeType) external onlyFactory {
        require(bridgeAddress != address(0), "Invalid bridge address");
        require(!bridges[bridgeAddress].exists, "Bridge already registered");
        
        bridges[bridgeAddress] = Bridge({
            bridgeAddress: bridgeAddress,
            bridgeType: bridgeType,
            createdAt: block.timestamp,
            exists: true
        });
        
        allBridges.push(bridgeAddress);
        
        emit BridgeRegistered(bridgeAddress, bridgeType, block.timestamp);
    }
    
    /**
     * @dev Register a new assistant
     * @param assistantAddress The address of the assistant contract
     * @param assistantType The type of assistant (Import or Export)
     */
    function registerAssistant(address assistantAddress, AssistantType assistantType) external onlyFactory {
        require(assistantAddress != address(0), "Invalid assistant address");
        require(!assistants[assistantAddress].exists, "Assistant already registered");
        
        assistants[assistantAddress] = Assistant({
            assistantAddress: assistantAddress,
            assistantType: assistantType,
            createdAt: block.timestamp,
            exists: true
        });
        
        allAssistants.push(assistantAddress);
        
        emit AssistantRegistered(assistantAddress, assistantType, block.timestamp);
    }
    
    /**
     * @dev Get bridge information
     * @param bridgeAddress The address of the bridge
     * @return bridge info struct
     */
    function getBridge(address bridgeAddress) external view returns (Bridge memory) {
        require(bridges[bridgeAddress].exists, "Bridge not found");
        return bridges[bridgeAddress];
    }
    
    /**
     * @dev Get assistant information
     * @param assistantAddress The address of the assistant
     * @return assistant info struct
     */
    function getAssistant(address assistantAddress) external view returns (Assistant memory) {
        require(assistants[assistantAddress].exists, "Assistant not found");
        return assistants[assistantAddress];
    }
    
    /**
     * @dev Check if a bridge is registered
     * @param bridgeAddress The address of the bridge
     * @return true if registered, false otherwise
     */
    function isBridgeRegistered(address bridgeAddress) external view returns (bool) {
        return bridges[bridgeAddress].exists;
    }
    
    /**
     * @dev Check if an assistant is registered
     * @param assistantAddress The address of the assistant
     * @return true if registered, false otherwise
     */
    function isAssistantRegistered(address assistantAddress) external view returns (bool) {
        return assistants[assistantAddress].exists;
    }
    
    /**
     * @dev Get all bridge addresses
     * @return array of all bridge addresses
     */
    function getAllBridges() external view returns (address[] memory) {
        return allBridges;
    }
    
    /**
     * @dev Get all assistant addresses
     * @return array of all assistant addresses
     */
    function getAllAssistants() external view returns (address[] memory) {
        return allAssistants;
    }
    
    /**
     * @dev Get bridges by type
     * @param bridgeType The type of bridges to return
     * @return array of bridge addresses of the specified type
     */
    function getBridgesByType(BridgeType bridgeType) external view returns (address[] memory) {
        address[] memory result = new address[](allBridges.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < allBridges.length; i++) {
            if (bridges[allBridges[i]].bridgeType == bridgeType) {
                result[count] = allBridges[i];
                count++;
            }
        }
        
        // Resize array to actual count
        assembly {
            mstore(result, count)
        }
        
        return result;
    }
    
    /**
     * @dev Get assistants by type
     * @param assistantType The type of assistants to return
     * @return array of assistant addresses of the specified type
     */
    function getAssistantsByType(AssistantType assistantType) external view returns (address[] memory) {
        address[] memory result = new address[](allAssistants.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < allAssistants.length; i++) {
            if (assistants[allAssistants[i]].assistantType == assistantType) {
                result[count] = allAssistants[i];
                count++;
            }
        }
        
        // Resize array to actual count
        assembly {
            mstore(result, count)
        }
        
        return result;
    }
    
    /**
     * @dev Get total count of bridges
     * @return total number of registered bridges
     */
    function getBridgeCount() external view returns (uint256) {
        return allBridges.length;
    }
    
    /**
     * @dev Get total count of assistants
     * @return total number of registered assistants
     */
    function getAssistantCount() external view returns (uint256) {
        return allAssistants.length;
    }
}
