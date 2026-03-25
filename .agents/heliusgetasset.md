import { createHelius } from "helius-sdk";

(async () => {
  const apiKey = ""; // From Helius dashboard
  const assetId = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // Example BONK mint

  const helius = createHelius({ apiKey });
  
  try {
    const asset = await helius.getAsset({ id: assetId });
    console.log("Asset from RPC: ", asset);
  } catch (error) {
    console.error("Error with RPC: ", error);
  }
})();





> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# getAsset

> Retrieve detailed information for a single Solana NFT, compressed NFT, or token including metadata, ownership, price data, and on-chain attributes

## Price Data Caching

<Warning>
  Price data returned by getAsset is cached and may not be fresh. The price information has a 600-second cache, meaning the data can be up to 600 seconds old.
</Warning>

Price data is available for the top 10k tokens by 24h volume and can be found in the `token_info.price_info` section of the response. For applications requiring real-time pricing, consider implementing additional validation.

## Request Parameters

<ParamField body="id" type="string">
  The unique identifier of the Solana NFT or digital asset to retrieve. This is typically the mint address of the NFT or token.
</ParamField>

<ParamField body="options" type="object">
  Display and formatting options for the asset data response.
</ParamField>

<ParamField body="options.showUnverifiedCollections" type="boolean" default="false">
  Displays grouping information for unverified collections instead of skipping them.
</ParamField>

<ParamField body="options.showCollectionMetadata" type="boolean" default="false">
  Displays metadata for the collection.
</ParamField>

<ParamField body="options.showFungible" type="boolean" default="false">
  Displays fungible tokens held by the owner.
</ParamField>

<ParamField body="options.showInscription" type="boolean" default="false">
  Displays inscription details of assets inscribed on-chain.
</ParamField>


## OpenAPI

````yaml /openapi/das-api/getAsset.yaml POST /
openapi: 3.1.0
info:
  title: Solana Digital Asset Standard (DAS) API
  version: 1.0.0
  description: >
    The Solana Digital Asset Standard (DAS) API provides comprehensive and
    standardized access to Solana blockchain NFTs and digital assets. 

    This powerful API set enables developers to retrieve detailed information
    about any digital asset on Solana, 

    including both traditional and compressed NFTs, with consistent data
    formatting regardless of token standard.


    Note, every successful DAS response includes a `last_indexed_slot` field
    indicating the most recent slot for which the DAS index is guaranteed to be

    complete. All on-chain data **up to and including** this slot has been
    indexed. Data beyond this slot may also have already been indexed,

    although it is not guaranteed.
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html
servers:
  - url: https://mainnet.helius-rpc.com
    description: Mainnet RPC endpoint
  - url: https://devnet.helius-rpc.com
    description: Devnet RPC endpoint
security: []
paths:
  /:
    post:
      tags:
        - RPC
      summary: getAsset
      description: >
        Retrieve comprehensive data for any Solana NFT or digital asset by its
        unique identifier.

        This endpoint provides complete on-chain and off-chain metadata,
        ownership details, royalty information,

        collection data, and compression state for any Solana digital asset. The
        getAsset method supports all token standards 

        including compressed NFTs (cNFTs), programmable NFTs (pNFTs), and
        traditional SPL tokens.


        Use this endpoint to:

        - Fetch complete metadata for NFT marketplace listings

        - Retrieve asset ownership information for wallet integrations

        - Access royalty and creator data for royalty enforcement

        - Check compression status to identify cost-efficient compressed NFTs

        - View collection grouping for NFT collection analytics
      operationId: rpc
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - jsonrpc
                - id
                - method
                - params
              properties:
                jsonrpc:
                  type: string
                  description: The JSON-RPC protocol version.
                  enum:
                    - '2.0'
                  default: '2.0'
                id:
                  type: string
                  description: A unique identifier for the request.
                  example: '1'
                  default: '1'
                method:
                  type: string
                  description: The name of the RPC method to invoke.
                  enum:
                    - getAsset
                  default: getAsset
                params:
                  type: object
                  default:
                    id: F9Lw3ki3hJ7PF9HQXsBzoY8GyE6sPoEZZdXJBsTTD2rk
                  properties:
                    id:
                      type: string
                      description: >-
                        The unique identifier of the Solana NFT or digital asset
                        to retrieve. This is typically the mint address of the
                        NFT or token.
                      example: F9Lw3ki3hJ7PF9HQXsBzoY8GyE6sPoEZZdXJBsTTD2rk
                    options:
                      type: object
                      description: >-
                        Display and formatting options for the asset data
                        response.
                      properties:
                        showUnverifiedCollections:
                          type: boolean
                          default: false
                          description: >-
                            Displays grouping information for unverified
                            collections instead of skipping them.
                        showCollectionMetadata:
                          type: boolean
                          default: false
                          description: Displays metadata for the collection.
                        showFungible:
                          type: boolean
                          description: Displays fungible tokens held by the owner.
                          default: false
                        showInscription:
                          type: boolean
                          description: >-
                            Displays inscription details of assets inscribed
                            on-chain.
                          default: false
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    enum:
                      - '2.0'
                    description: The version of the JSON-RPC protocol.
                  id:
                    type: string
                    description: The ID used to identify the request.
                  result:
                    type: object
                    properties:
                      last_indexed_slot:
                        type: integer
                        description: >-
                          All data up to and including this slot is guaranteed
                          to have been indexed.
                      interface:
                        type: string
                        description: >-
                          The interface type of the Solana digital asset,
                          indicating its token standard and implementation.
                        enum:
                          - V1_NFT
                          - V1_PRINT
                          - LEGACY_NFT
                          - V2_NFT
                          - FungibleAsset
                          - FungibleToken
                          - Custom
                          - Identity
                          - Executable
                          - ProgrammableNFT
                      id:
                        type: string
                        description: The unique identifier of the asset.
                      content:
                        type: object
                        description: >-
                          Content information of the Solana digital asset,
                          including metadata, files, and links.
                        properties:
                          $schema:
                            type: string
                            description: The schema URL for the asset metadata.
                          json_uri:
                            type: string
                            description: >-
                              URI pointing to the JSON metadata for the Solana
                              NFT, typically hosted on Arweave or other
                              decentralized storage.
                          files:
                            type: array
                            description: Array of files associated with the asset.
                            items:
                              type: object
                          metadata:
                            type: object
                            description: >-
                              Complete metadata information about the Solana
                              digital asset, including name, symbol, attributes,
                              and token standard.
                            properties:
                              name:
                                type: string
                                description: The name of the asset.
                              symbol:
                                type: string
                                description: The symbol of the asset.
                              attributes:
                                type: array
                                description: Array of trait attributes.
                                items:
                                  type: object
                                  properties:
                                    value:
                                      type: string
                                      description: The value of the trait.
                                    trait_type:
                                      type: string
                                      description: The type of the trait.
                              description:
                                type: string
                                description: Description of the asset.
                              token_standard:
                                type: string
                                description: Token standard used.
                          links:
                            type: object
                            description: External links related to the asset.
                      authorities:
                        type: array
                        description: List of authorities associated with the asset.
                        items:
                          type: object
                          properties:
                            address:
                              type: string
                              description: The authority's address.
                            scopes:
                              type: array
                              description: The scopes of authority.
                              items:
                                type: string
                      compression:
                        type: object
                        description: >-
                          Compression details of the Solana digital asset,
                          indicating if it's a compressed NFT with state proof
                          validation.
                        properties:
                          eligible:
                            type: boolean
                            description: Whether the asset is eligible for compression.
                          compressed:
                            type: boolean
                            description: >-
                              Whether the asset is currently compressed using
                              Solana's state compression technology, which
                              reduces storage costs.
                          data_hash:
                            type: string
                            description: Hash of the asset data.
                          creator_hash:
                            type: string
                            description: Hash of the creator data.
                          asset_hash:
                            type: string
                            description: Hash of the entire asset.
                          tree:
                            type: string
                            description: Merkle tree address.
                          seq:
                            type: integer
                            description: Sequence number.
                          leaf_id:
                            type: integer
                            description: Leaf identifier in the merkle tree.
                      grouping:
                        type: array
                        description: Grouping information for the asset.
                        items:
                          type: object
                          properties:
                            group_key:
                              type: string
                              description: The key identifying the group.
                            group_value:
                              type: string
                              description: The value associated with the group.
                      royalty:
                        type: object
                        description: >-
                          Royalty information for the Solana digital asset, used
                          for marketplace fee calculations and creator payments.
                        properties:
                          royalty_model:
                            type: string
                            description: The model used for royalties.
                          target:
                            type:
                              - string
                              - 'null'
                            description: The target address for royalties.
                          percent:
                            type: number
                            description: Royalty percentage.
                          basis_points:
                            type: integer
                            description: Royalty basis points.
                          primary_sale_happened:
                            type: boolean
                            description: Whether the primary sale has occurred.
                          locked:
                            type: boolean
                            description: Whether the royalty is locked.
                      creators:
                        type: array
                        description: List of creators of the asset.
                        items:
                          type: object
                          properties:
                            address:
                              type: string
                              description: The creator's address.
                            share:
                              type: integer
                              description: The creator's share percentage.
                            verified:
                              type: boolean
                              description: Whether the creator is verified.
                      ownership:
                        type: object
                        description: >-
                          Ownership details of the Solana digital asset,
                          including current owner, delegation status, and
                          freezing information.
                        required:
                          - frozen
                          - delegated
                          - ownership_model
                          - owner
                        properties:
                          frozen:
                            type: boolean
                            description: Whether the asset is frozen.
                          delegated:
                            type: boolean
                            description: Whether the asset is delegated.
                          delegate:
                            type:
                              - string
                              - 'null'
                            description: The delegate's address if delegated.
                          ownership_model:
                            type: string
                            description: The model of ownership.
                          owner:
                            type: string
                            description: The owner's address.
                      supply:
                        type:
                          - object
                          - 'null'
                        description: Supply information for the asset.
                        properties:
                          print_max_supply:
                            type: integer
                            description: Maximum supply that can be printed.
                          print_current_supply:
                            type: integer
                            description: Current printed supply.
                          edition_nonce:
                            type: integer
                            description: Edition nonce.
                      mutable:
                        type: boolean
                        description: Whether the asset is mutable.
                      burnt:
                        type: boolean
                        description: Whether the asset has been burnt.
                      token_info:
                        type: object
                        description: Token-specific information.
                        properties:
                          supply:
                            type: integer
                            description: Total token supply.
                          decimals:
                            type: integer
                            description: Number of decimals.
                          token_program:
                            type: string
                            description: Token program ID.
                          mint_authority:
                            type: string
                            description: Mint authority address.
                          freeze_authority:
                            type: string
                            description: Freeze authority address.
              examples:
                success:
                  value:
                    jsonrpc: '2.0'
                    id: test
                    result:
                      last_indexed_slot: 365749093
                      interface: ProgrammableNFT
                      id: F9Lw3ki3hJ7PF9HQXsBzoY8GyE6sPoEZZdXJBsTTD2rk
                      content:
                        $schema: https://schema.metaplex.com/nft1.0.json
                        json_uri: >-
                          https://madlads.s3.us-west-2.amazonaws.com/json/8420.json
                        files:
                          - uri: >-
                              https://madlads.s3.us-west-2.amazonaws.com/images/8420.png
                            cdn_uri: >-
                              https://cdn.helius-rpc.com/cdn-cgi/image//https://madlads.s3.us-west-2.amazonaws.com/images/8420.png
                            mime: image/png
                          - uri: >-
                              https://arweave.net/qJ5B6fx5hEt4P7XbicbJQRyTcbyLaV-OQNA1KjzdqOQ/0.png
                            cdn_uri: >-
                              https://cdn.helius-rpc.com/cdn-cgi/image//https://arweave.net/qJ5B6fx5hEt4P7XbicbJQRyTcbyLaV-OQNA1KjzdqOQ/0.png
                            mime: image/png
                        metadata:
                          attributes:
                            - value: Male
                              trait_type: Gender
                            - value: King
                              trait_type: Type
                            - value: Royal
                              trait_type: Expression
                            - value: Mad Crown
                              trait_type: Hat
                            - value: Madness
                              trait_type: Eyes
                            - value: Mad Armor
                              trait_type: Clothing
                            - value: Royal Rug
                              trait_type: Background
                          description: Fock it.
                          name: 'Mad Lads #8420'
                          symbol: MAD
                          token_standard: ProgrammableNonFungible
                        links:
                          image: >-
                            https://madlads.s3.us-west-2.amazonaws.com/images/8420.png
                          external_url: https://madlads.com
                      authorities:
                        - address: 2RtGg6fsFiiF1EQzHqbd66AhW7R5bWeQGpTbv2UMkCdW
                          scopes:
                            - full
                      compression:
                        eligible: false
                        compressed: false
                        data_hash: ''
                        creator_hash: ''
                        asset_hash: ''
                        tree: ''
                        seq: 0
                        leaf_id: 0
                      grouping:
                        - group_key: collection
                          group_value: J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w
                      royalty:
                        royalty_model: creators
                        target: null
                        percent: 0.042
                        basis_points: 420
                        primary_sale_happened: true
                        locked: false
                      creators:
                        - address: 5XvhfmRjwXkGp3jHGmaKpqeerNYjkuZZBYLVQYdeVcRv
                          share: 0
                          verified: true
                        - address: 2RtGg6fsFiiF1EQzHqbd66AhW7R5bWeQGpTbv2UMkCdW
                          share: 100
                          verified: true
                      ownership:
                        frozen: true
                        delegated: false
                        delegate: null
                        ownership_model: single
                        owner: 4zdNGgAtFsW1cQgHqkiWyRsxaAgxrSRRynnuunxzjxue
                      supply:
                        print_max_supply: 0
                        print_current_supply: 0
                        edition_nonce: 254
                      mutable: true
                      burnt: false
                      token_info:
                        supply: 1
                        decimals: 0
                        token_program: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
                        mint_authority: TdMA45ZnakQCBt5XUvm7ib2htKuTWdcgGKu1eUGrDyJ
                        freeze_authority: TdMA45ZnakQCBt5XUvm7ib2htKuTWdcgGKu1eUGrDyJ
        '400':
          description: >-
            Bad Request. The server could not understand the request due to
            invalid syntax.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    example: '2.0'
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: -32602
                      message:
                        type: string
                        example: Invalid request parameters.
                  id:
                    type: string
                    example: '1'
        '401':
          description: >-
            Unauthorized. The client must authenticate itself to get the
            requested response.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    example: '2.0'
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: -32001
                      message:
                        type: string
                        example: Authentication failed. Missing or invalid API key.
                  id:
                    type: string
                    example: '1'
        '403':
          description: Forbidden. The client does not have access rights to the content.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    example: '2.0'
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: -32003
                      message:
                        type: string
                        example: You do not have permission to access this resource.
                  id:
                    type: string
                    example: '1'
        '404':
          description: Not Found. The server can not find the requested resource.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    example: '2.0'
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: -32004
                      message:
                        type: string
                        example: The requested asset was not found.
                  id:
                    type: string
                    example: '1'
        '429':
          description: >-
            Too Many Requests. The user has sent too many requests in a given
            amount of time.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    example: '2.0'
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: -32029
                      message:
                        type: string
                        example: Rate limit exceeded. Please try again later.
                  id:
                    type: string
                    example: '1'
        '500':
          description: >-
            Internal Server Error. The server has encountered a situation it
            doesn't know how to handle.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    example: '2.0'
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: -32000
                      message:
                        type: string
                        example: An unexpected error occurred on the server.
                  id:
                    type: string
                    example: '1'
      security:
        - ApiKeyQuery: []
components:
  securitySchemes:
    ApiKeyQuery:
      type: apiKey
      in: query
      name: api-key
      description: >-
        Your Helius API key. You can get one for free in the
        [dashboard](https://dashboard.helius.dev/api-keys).

````

Built with [Mintlify](https://mintlify.com).





const response = await fetch("https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY", {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'getAsset',
    params: {
      id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      options: {
        showFungible: true
      }
    }
  })
});
const data = await response.json();
console.log(data);