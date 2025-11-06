/**
 * High-Resolution Map Capture Tool
 *
 * This tool captures high-definition map images for specified coordinate areas.
 * Uses a 3x3 grid pattern to ensure full coverage of the defined area.
 * Features disk-based block stitching with file-to-file operations to avoid Sharp's limitations.
 *
 * SETUP:
 * 1. Install dependencies: npm install axios sharp
 * 2. That's it! No API keys needed for street maps (geoapify) or satellite (ESRI)
 *
 * USAGE:
 * - Set CONFIG.provider to 'geoapify' for street maps or 'esri' for satellite
 * - Define areas with two lat/lon points in CONFIG.areas array
 * - Set use3x3Grid: true to download center + 8 surrounding areas (recommended)
 * - Set tileSize: 512 for higher quality (default)
 * - Run: node index.js
 *
 * STITCHING ALGORITHM (3-Phase Block Approach):
 * - Phase 1: Tiles are divided into 10x10 blocks, each block stitched and saved to disk
 * - Phase 2: Blocks are stitched horizontally (recursively 2-by-2) into block rows
 * - Phase 3: Block rows are stitched vertically (recursively 2-by-2) to create final image
 * - All operations use Sharp's file-to-file mode (no buffers) to avoid memory limits
 * - Images never loaded into memory - Sharp streams directly from/to disk
 *
 * OUTPUT:
 * - High-resolution PNG files named: {areaName}_{provider}_zoom{zoom}.png
 * - Can handle extremely large maps (50,000+ tiles) with minimal memory usage
 * - No Sharp buffer limitations - only disk space is the limit
 */

const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

// ============ CONFIGURATION ============
const CONFIG = {
    // Provider options:
    // - 'geoapify' (street map, free) ⭐ DEFAULT
    // - 'esri' (FREE satellite, no credit card required)
    // - 'mapbox' (satellite, requires credit card for free tier)
    provider: 'geoapify',

    // API Keys (only needed for certain providers)
    geoapifyKey: 'bb4c8bd74f714b58909203373fed1f2a',
    mapboxToken: 'YOUR_MAPBOX_TOKEN_HERE', // Only if using mapbox

    // Map areas - Define areas using two lat/lon points (southwest and northeast corners)
    // IMPORTANT: Keep areas small! At zoom 18, use ~0.01 degree difference (about 1km)
    areas: [
        {
            name: 'zone1',
            point2: { lat: 34.06384, lon: -118.28422 },  // Southwest corner
            point1: { lat: 34.03518, lon: -118.2389 }   // Northeast corner (~1km x 1km)
//        },{
//            name: 'zone2',
//            point2: { lat: 34.02301, lon: -118.5085 },  // Southwest corner
//            point1: { lat: 33.97149, lon: -118.43125 }   // Northeast corner (~1km x 1km)
//        },{
//            name: 'zone3',
//            point2: { lat: 33.96409, lon: -118.39589 },  // Southwest corner
//            point1: { lat: 33.89971, lon: -118.32585 }   // Northeast corner (~1km x 1km)
//        },{
//            name: 'zone4',
//            point2: { lat: 34.07715, lon: -118.42067 },  // Southwest corner
//            point1: { lat: 34.05731, lon: -118.38806 }   // Northeast corner (~1km x 1km)
        }        // Add more areas as needed:
        // {
        //     name: 'santa_monica',
        //     point1: { lat: 34.014, lon: -118.505 },
        //     point2: { lat: 34.024, lon: -118.495 }
        // }
    ],

    zoom: 18, // Higher = more detail (max ~19 for ESRI, ~20-21 for Mapbox)
    tileSize: 512, // Default tile size (512x512 for better quality)

    // Download 3x3 grid (center = defined area, 8 surrounding areas of same size)
    use3x3Grid: true,

    // Maximum tiles to download (safety limit to prevent too many downloads)
    // With disk-based stitching, memory is no longer a constraint
    maxTiles: 50000,

    // Geoapify style options: 'osm-carto', 'osm-bright', 'osm-bright-grey', 'klokantech-basic', 'osm-liberty'
    geoapifyStyle: 'osm-carto',

    // Mapbox style options: 'satellite-v9' (pure satellite), 'satellite-streets-v12' (satellite + labels)
    mapboxStyle: 'satellite-v9',

    // Cache settings
    dataFolder: './data' // Folder to cache downloaded tiles
};

// Tile size - Geoapify and Mapbox support 512x512 (@2x), ESRI only supports 256x256
const TILE_SIZE = CONFIG.provider === 'esri' ? 256 : CONFIG.tileSize;

// Function to convert longitude and latitude to tile numbers
function long2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

// ============ BOUNDING BOX CREATION ============
const createBoundingBox = (point1, point2) => {
    // Create bounding box from two points
    // bbox format: [minLon, minLat, maxLon, maxLat]
    const minLon = Math.min(point1.lon, point2.lon);
    const maxLon = Math.max(point1.lon, point2.lon);
    const minLat = Math.min(point1.lat, point2.lat);
    const maxLat = Math.max(point1.lat, point2.lat);

    return [minLon, minLat, maxLon, maxLat];
};

// ============ CACHE MANAGEMENT ============
const ensureDataFolder = () => {
    // Create main data folder
    if (!fs.existsSync(CONFIG.dataFolder)) {
        fs.mkdirSync(CONFIG.dataFolder, { recursive: true });
        console.log(`📁 Created cache folder: ${CONFIG.dataFolder}`);
    }

    // Create provider-specific subfolder
    const providerFolder = `${CONFIG.dataFolder}/${CONFIG.provider}_z${CONFIG.zoom}`;
    if (!fs.existsSync(providerFolder)) {
        fs.mkdirSync(providerFolder, { recursive: true });
        console.log(`📁 Created cache subfolder: ${providerFolder}`);
    }

    return providerFolder;
};

const ensureTempFolder = (areaName) => {
    const tempFolder = `${CONFIG.dataFolder}/temp_${areaName}`;
    if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder, { recursive: true });
    }
    return tempFolder;
};

const cleanupTempFolder = (tempFolder) => {
    if (fs.existsSync(tempFolder)) {
        fs.rmSync(tempFolder, { recursive: true, force: true });
    }
};

const getTileCachePath = (x, y, zoom) => {
    const providerFolder = `${CONFIG.dataFolder}/${CONFIG.provider}_z${zoom}`;
    return `${providerFolder}/tile_${x}_${y}.png`;
};

// ============ TILE URL PROVIDERS ============
const getTileUrl = (x, y, zoom) => {
    switch (CONFIG.provider) {
        case 'esri':
            // ESRI World Imagery - FREE, no API key required!
            // Docs: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
            // Attribution: "Powered by Esri" (automatically added to console output)
            return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;

        case 'mapbox':
            // Mapbox Static Tiles API (requires credit card for free tier)
            // Docs: https://docs.mapbox.com/api/maps/static-tiles/
            return `https://api.mapbox.com/v4/mapbox.${CONFIG.mapboxStyle}/${zoom}/${x}/${y}@2x.png?access_token=${CONFIG.mapboxToken}`;

        case 'geoapify':
            // Geoapify Maps API (OpenStreetMap based)
            // Styles: osm-carto, osm-bright, osm-bright-grey, klokantech-basic, osm-liberty
            // Use @2x for 512x512 tiles (scaleFactor=2)
            const scaleFactor = CONFIG.tileSize === 512 ? '@2x' : '';
            return `https://maps.geoapify.com/v1/tile/${CONFIG.geoapifyStyle}/${zoom}/${x}/${y}${scaleFactor}.png?apiKey=${CONFIG.geoapifyKey}`;

        default:
            throw new Error(`Unknown provider: ${CONFIG.provider}`);
    }
};

// ============ TILE DOWNLOADING ============
// Cache statistics
let cacheStats = { hits: 0, misses: 0 };

const getMapTile = async (x, y, zoom) => {
    const cachePath = getTileCachePath(x, y, zoom);

    // Check if tile exists in cache
    if (fs.existsSync(cachePath)) {
        try {
            cacheStats.hits++;
            return fs.readFileSync(cachePath);
        } catch (error) {
            console.warn(`Cache read failed for tile ${zoom}/${x}/${y}, re-downloading...`);
            // Continue to download if cache read fails
        }
    }

    // Download tile from provider
    cacheStats.misses++;
    const url = getTileUrl(x, y, zoom);
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const tileData = response.data;

        // Save to cache
        try {
            fs.writeFileSync(cachePath, tileData);
        } catch (error) {
            console.warn(`Failed to cache tile ${zoom}/${x}/${y}: ${error.message}`);
            // Continue even if caching fails
        }

        return tileData;
    } catch (error) {
        console.error(`Failed to download tile ${zoom}/${x}/${y} from ${url}`);
        throw new Error(`Failed to download tile ${zoom}/${x}/${y}: ${error.message}`);
    }
};

// ============ MAIN PROCESSING ============
const downloadAndStitchMaps = async () => {
    // Ensure cache directory exists
    ensureDataFolder();

    console.log(`\n🗺️  Map Provider: ${CONFIG.provider.toUpperCase()}`);
    console.log(`📍 Processing ${CONFIG.areas.length} area(s) at zoom level ${CONFIG.zoom}\n`);

    for (const area of CONFIG.areas) {
        try {
            console.log(`Processing area: ${area.name}...`);

            // Create bounding box from the two points
            const bbox = createBoundingBox(area.point1, area.point2);
            const [minLon, minLat, maxLon, maxLat] = bbox;

            // Log bounding box
            console.log(`Area bbox: [${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${maxLon.toFixed(6)}, ${maxLat.toFixed(6)}]`);
            console.log(`  Point 1: (${area.point1.lat}, ${area.point1.lon})`);
            console.log(`  Point 2: (${area.point2.lat}, ${area.point2.lon})`);

            // Calculate tile range for the defined area
            const centerMinTileX = long2tile(minLon, CONFIG.zoom);
            const centerMaxTileX = long2tile(maxLon, CONFIG.zoom);
            const centerMinTileY = lat2tile(maxLat, CONFIG.zoom);
            const centerMaxTileY = lat2tile(minLat, CONFIG.zoom);

            const centerNumTilesX = centerMaxTileX - centerMinTileX + 1;
            const centerNumTilesY = centerMaxTileY - centerMinTileY + 1;
            const centerTileCount = centerNumTilesX * centerNumTilesY;

            console.log(`Center area: X[${centerMinTileX} to ${centerMaxTileX}] (${centerNumTilesX} tiles), Y[${centerMinTileY} to ${centerMaxTileY}] (${centerNumTilesY} tiles)`);

            // Calculate total tile count with 3x3 grid
            const totalTileCount = CONFIG.use3x3Grid ? centerTileCount * 9 : centerTileCount;
            const estimatedDiskMB = Math.round((totalTileCount * TILE_SIZE * TILE_SIZE * 4) / (1024 * 1024));

            // Safety check: prevent downloading too many tiles
            if (totalTileCount > CONFIG.maxTiles) {
                console.error(`\n❌ ERROR: Area too large!`);
                console.error(`   This area requires ${totalTileCount.toLocaleString()} tiles (${centerTileCount.toLocaleString()} center + ${CONFIG.use3x3Grid ? '8 surrounding areas' : 'no grid'})`);
                console.error(`   Maximum allowed: ${CONFIG.maxTiles.toLocaleString()} tiles`);
                console.error(`   Estimated disk space needed: ~${estimatedDiskMB}MB\n`);
                console.error(`Solutions:`);
                console.error(`   1. Reduce area size (move coordinates closer together)`);
                console.error(`   2. Lower zoom level (try 15 or 16 instead of ${CONFIG.zoom})`);
                console.error(`   3. Disable 3x3 grid: set use3x3Grid: false`);
                console.error(`   4. Increase maxTiles limit in CONFIG`);
                console.error(`\nNote: With disk-based stitching, memory is no longer a constraint!\n`);
                process.exit(1);
            }

            console.log(`   Estimated tiles: ${totalTileCount.toLocaleString()} (~${estimatedDiskMB}MB disk space)`);

            // Expand to 3x3 grid if enabled
            let minTileX, maxTileX, minTileY, maxTileY;
            if (CONFIG.use3x3Grid) {
                // Add the same width/height on each side to create a 3x3 grid
                minTileX = centerMinTileX - centerNumTilesX;
                maxTileX = centerMaxTileX + centerNumTilesX;
                minTileY = centerMinTileY - centerNumTilesY;
                maxTileY = centerMaxTileY + centerNumTilesY;

                const numTilesX = maxTileX - minTileX + 1;
                const numTilesY = maxTileY - minTileY + 1;

                console.log(`📐 Using 3x3 grid pattern:`);
                console.log(`   Full area: X[${minTileX} to ${maxTileX}] (${numTilesX} tiles), Y[${minTileY} to ${maxTileY}] (${numTilesY} tiles)`);
                console.log(`   Downloading ${numTilesX * numTilesY} tiles (center area + 8 surrounding areas)...`);
            } else {
                minTileX = centerMinTileX;
                maxTileX = centerMaxTileX;
                minTileY = centerMinTileY;
                maxTileY = centerMaxTileY;
                console.log(`Downloading ${centerNumTilesX * centerNumTilesY} tiles...`);
            }

            const numTilesX = maxTileX - minTileX + 1;
            const numTilesY = maxTileY - minTileY + 1;

            // Reset cache stats for this area
            const beforeHits = cacheStats.hits;
            const beforeMisses = cacheStats.misses;

            // Create temp folder for intermediate images
            const tempFolder = ensureTempFolder(area.name);

            // Define block size to avoid Sharp's limitations
            // Process tiles in smaller blocks (e.g., 10x10 tiles per block)
            const BLOCK_SIZE_TILES = 10;
            const blockFiles = [];

            console.log(`   🔄 Stitching ${numTilesX}x${numTilesY} tiles in blocks of ${BLOCK_SIZE_TILES}x${BLOCK_SIZE_TILES}...`);

            // Phase 1: Create blocks by stitching tiles in chunks
            const numBlocksX = Math.ceil(numTilesX / BLOCK_SIZE_TILES);
            const numBlocksY = Math.ceil(numTilesY / BLOCK_SIZE_TILES);
            console.log(`   📦 Creating ${numBlocksX}x${numBlocksY} blocks...`);

            for (let blockY = 0; blockY < numBlocksY; blockY++) {
                for (let blockX = 0; blockX < numBlocksX; blockX++) {
                    // Calculate tile range for this block
                    const startTileX = minTileX + (blockX * BLOCK_SIZE_TILES);
                    const endTileX = Math.min(startTileX + BLOCK_SIZE_TILES - 1, maxTileX);
                    const startTileY = minTileY + (blockY * BLOCK_SIZE_TILES);
                    const endTileY = Math.min(startTileY + BLOCK_SIZE_TILES - 1, maxTileY);

                    const blockNumTilesX = endTileX - startTileX + 1;
                    const blockNumTilesY = endTileY - startTileY + 1;

                    console.log(`   🔨 Block ${blockY * numBlocksX + blockX + 1}/${numBlocksX * numBlocksY}: ${blockNumTilesX}x${blockNumTilesY} tiles...`);

                    // Download all tiles for this block
                    const blockTiles = [];
                    for (let y = startTileY; y <= endTileY; y++) {
                        for (let x = startTileX; x <= endTileX; x++) {
                            blockTiles.push(getMapTile(x, y, CONFIG.zoom));
                        }
                    }
                    const blockTileBuffers = await Promise.all(blockTiles);

                    // Ensure all tiles are exactly TILE_SIZE x TILE_SIZE
                    const processedTiles = await Promise.all(
                        blockTileBuffers.map(buffer =>
                            sharp(buffer)
                                .resize(TILE_SIZE, TILE_SIZE, {
                                    fit: 'fill'
                                })
                                .toBuffer()
                        )
                    );

                    // Stitch tiles in this block
                    const blockCompositeOptions = [];
                    let tileIndex = 0;
                    for (let y = startTileY; y <= endTileY; y++) {
                        for (let x = startTileX; x <= endTileX; x++) {
                            const localX = x - startTileX;
                            const localY = y - startTileY;
                            blockCompositeOptions.push({
                                input: processedTiles[tileIndex++],
                                left: localX * TILE_SIZE,
                                top: localY * TILE_SIZE,
                            });
                        }
                    }

                    // Create block image - save directly to file (no buffer)
                    const blockFilePath = path.join(tempFolder, `block_${blockY}_${blockX}.png`);
                    await sharp({
                        create: {
                            width: blockNumTilesX * TILE_SIZE,
                            height: blockNumTilesY * TILE_SIZE,
                            channels: 4,
                            background: { r: 0, g: 0, b: 0, alpha: 0 },
                        },
                    })
                        .composite(blockCompositeOptions)
                        .png()
                        .toFile(blockFilePath);

                    if (!blockFiles[blockY]) blockFiles[blockY] = [];
                    blockFiles[blockY][blockX] = blockFilePath;
                }
            }

            // Calculate cache stats for this area
            const areaHits = cacheStats.hits - beforeHits;
            const areaMisses = cacheStats.misses - beforeMisses;
            const totalTiles = areaHits + areaMisses;
            const cachePercent = totalTiles > 0 ? Math.round((areaHits / totalTiles) * 100) : 0;

            console.log(`   💾 Cache: ${areaHits} from cache, ${areaMisses} downloaded (${cachePercent}% cached)`);
            console.log(`   🔗 Stitching ${numBlocksX}x${numBlocksY} blocks into final image using recursive 2-by-2 approach...`);

            // Phase 2: First stitch blocks horizontally into rows
            const blockRowFiles = [];
            for (let blockY = 0; blockY < numBlocksY; blockY++) {
                console.log(`   📐 Stitching block row ${blockY + 1}/${numBlocksY}...`);

                let currentRowFiles = blockFiles[blockY];
                let iteration = 0;

                // Recursively stitch blocks in this row horizontally
                while (currentRowFiles.length > 1) {
                    iteration++;
                    const nextFiles = [];

                    for (let i = 0; i < currentRowFiles.length; i += 2) {
                        if (i + 1 < currentRowFiles.length) {
                            const file1 = currentRowFiles[i];
                            const file2 = currentRowFiles[i + 1];

                            const meta1 = await sharp(file1).metadata();
                            const meta2 = await sharp(file2).metadata();

                            const stitchedPath = path.join(tempFolder, `row${blockY}_iter${iteration}_${Math.floor(i / 2)}.png`);

                            // Stitch horizontally using file-based operations (no buffers)
                            await sharp({
                                create: {
                                    width: meta1.width + meta2.width,
                                    height: meta1.height,
                                    channels: 4,
                                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                                },
                            })
                                .composite([
                                    { input: file1, left: 0, top: 0 },
                                    { input: file2, left: meta1.width, top: 0 }
                                ])
                                .png()
                                .toFile(stitchedPath);

                            nextFiles.push(stitchedPath);
                        } else {
                            nextFiles.push(currentRowFiles[i]);
                        }
                    }

                    currentRowFiles = nextFiles;
                }

                blockRowFiles.push(currentRowFiles[0]);
            }

            // Phase 3: Stitch the block rows vertically using 2-by-2 recursive approach
            console.log(`   🔗 Stitching ${blockRowFiles.length} block rows vertically...`);

            let currentFiles = blockRowFiles;
            let iteration = 0;

            while (currentFiles.length > 1) {
                iteration++;
                console.log(`   📦 Iteration ${iteration}: Stitching ${currentFiles.length} files into ${Math.ceil(currentFiles.length / 2)}...`);

                const nextFiles = [];

                for (let i = 0; i < currentFiles.length; i += 2) {
                    if (i + 1 < currentFiles.length) {
                        const file1 = currentFiles[i];
                        const file2 = currentFiles[i + 1];

                        const meta1 = await sharp(file1).metadata();
                        const meta2 = await sharp(file2).metadata();

                        const stitchedPath = path.join(tempFolder, `final_iter${iteration}_${Math.floor(i / 2)}.png`);

                        // Stitch vertically using file-based operations (no buffers)
                        await sharp({
                            create: {
                                width: meta1.width,
                                height: meta1.height + meta2.height,
                                channels: 4,
                                background: { r: 0, g: 0, b: 0, alpha: 0 },
                            },
                        })
                            .composite([
                                { input: file1, left: 0, top: 0 },
                                { input: file2, left: 0, top: meta1.height }
                            ])
                            .png()
                            .toFile(stitchedPath);

                        nextFiles.push(stitchedPath);
                    } else {
                        nextFiles.push(currentFiles[i]);
                    }
                }

                currentFiles = nextFiles;
            }

            // The final file is the last remaining file
            const finalFilePath = currentFiles[0];
            const outputPath = `./${area.name}_${CONFIG.provider}_zoom${CONFIG.zoom}.png`;

            // Copy final file to output location
            fs.copyFileSync(finalFilePath, outputPath);

            // Clean up temporary row files
            console.log(`   🧹 Cleaning up temporary files...`);
            cleanupTempFolder(tempFolder);

            console.log(`✅ Map for ${area.name} saved to ${outputPath}`);
            console.log(`   Image size: ${numTilesX * TILE_SIZE}x${numTilesY * TILE_SIZE} pixels\n`);
        } catch (error) {
            console.error(`Failed to process ${area.name}:`, error.message);
        }
    }
};

// ============ VALIDATION & START ============
const validateConfig = () => {
    if (CONFIG.provider === 'mapbox' && CONFIG.mapboxToken === 'YOUR_MAPBOX_TOKEN_HERE') {
        console.error('❌ Error: Please set your Mapbox token in CONFIG.mapboxToken');
        console.error('   Get a free token at: https://account.mapbox.com/access-tokens/');
        console.error('   Note: Mapbox requires a credit card even for free tier');
        console.error('   💡 Use provider: "esri" instead for truly free satellite imagery!');
        process.exit(1);
    }
    if (CONFIG.provider === 'geoapify' && !CONFIG.geoapifyKey) {
        console.error('❌ Error: Please set your Geoapify API key in CONFIG.geoapifyKey');
        process.exit(1);
    }
    if (!CONFIG.areas || CONFIG.areas.length === 0) {
        console.error('❌ Error: Please add at least one area to CONFIG.areas');
        console.error('   Each area needs: name, point1 {lat, lon}, point2 {lat, lon}');
        process.exit(1);
    }

    // Validate each area
    for (const area of CONFIG.areas) {
        if (!area.name || !area.point1 || !area.point2) {
            console.error(`❌ Error: Area missing required fields (name, point1, point2)`);
            process.exit(1);
        }
        if (typeof area.point1.lat !== 'number' || typeof area.point1.lon !== 'number' ||
            typeof area.point2.lat !== 'number' || typeof area.point2.lon !== 'number') {
            console.error(`❌ Error: Area "${area.name}" has invalid lat/lon coordinates`);
            process.exit(1);
        }
    }

    // Show attribution for ESRI
    if (CONFIG.provider === 'esri') {
        console.log('📸 Using ESRI World Imagery (FREE satellite imagery)');
        console.log('   Attribution: Powered by Esri');
        if (CONFIG.tileSize > 256) {
            console.log('   ⚠️  Note: ESRI only supports 256x256 tiles, using 256x256 instead of ' + CONFIG.tileSize);
        }
        console.log('');
    }
};

validateConfig();
downloadAndStitchMaps();
