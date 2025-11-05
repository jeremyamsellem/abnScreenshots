# High-Resolution Map Capture Tool

Automatically capture high-definition satellite or street map images for custom geographic areas by stitching together map tiles.

## Features

- ✅ **100% FREE**: No credit card required for street maps or satellite imagery!
- ✅ **Custom Areas**: Define exact areas using two lat/lon coordinate points
- ✅ **3x3 Grid Coverage**: Downloads center area + 8 surrounding areas for complete coverage
- ✅ **Three providers**: Geoapify (street maps), ESRI (satellite), or Mapbox (satellite)
- ✅ **High resolution**: High-quality imagery at zoom 18
- ✅ **Batch processing**: Process multiple areas at once
- ✅ **Automatic stitching**: Seamlessly combines tiles into one image
- ✅ **No API key needed**: Works out of the box!

## Setup

### 1. Install Dependencies

```bash
npm install axios sharp
```

### 2. Configure Your Areas

Edit `index.js` and define your areas using two lat/lon coordinate points:

```javascript
const CONFIG = {
    provider: 'geoapify',  // Street maps (or 'esri' for satellite)

    // Define areas using two points (opposite corners of a rectangle)
    areas: [
        {
            name: 'downtown',
            point1: { lat: 40.7489, lon: -73.9680 },  // Southwest corner
            point2: { lat: 40.7589, lon: -73.9580 }   // Northeast corner
        },
        {
            name: 'central_park',
            point1: { lat: 40.764, lon: -73.973 },
            point2: { lat: 40.800, lon: -73.949 }
        }
    ],

    zoom: 18,  // 18 = high detail, 15 = wider area
    use3x3Grid: true,  // Download center + 8 surrounding areas (recommended!)
};
```

**How to get coordinates:**
- Use Google Maps: Right-click on a location → Click the coordinates to copy
- Or use any other mapping service that displays lat/lon

**⚠️ IMPORTANT - Area Size Limits:**
- At **zoom 18**, keep areas to **~0.01° difference** (about 1km x 1km)
- At **zoom 16**, you can use **~0.05° difference** (about 5km x 5km)
- At **zoom 14**, you can use **~0.2° difference** (about 20km x 20km)
- Default limit: **5,000 tiles** maximum
- Too large = Out of memory error!

**Example safe areas at zoom 18:**
```javascript
// Good: ~1km x 1km (about 400 tiles with 3x3 grid)
point1: { lat: 34.0422, lon: -118.2537 }
point2: { lat: 34.0522, lon: -118.2437 }

// Bad: ~20km x 31km (150,000+ tiles - will crash!)
point1: { lat: 34.0853, lon: -118.5081 }
point2: { lat: 33.9008, lon: -118.2290 }
```

## How the 3x3 Grid Works

The tool downloads a 3×3 grid pattern where:
```
[Area] [Area] [Area]
[Area] [Your] [Area]  ← Your = the area between your two points
[Area] [Area] [Area]
```

Each surrounding area has the same width and height as your defined area, ensuring complete coverage of the entire region and surrounding context.

### 3. Optional API Keys (only if not using ESRI)

#### For Mapbox (Satellite Imagery)
⚠️ **Requires credit card** even for free tier
1. Go to https://account.mapbox.com/
2. Sign up and add credit card
3. Navigate to "Access Tokens"
4. Copy your default public token
5. Free tier: 50,000 tile requests/month

#### For Geoapify (Street Maps)
- Already configured with the existing API key
- Free tier available

## Usage

```bash
node index.js
```

The tool will:
1. Create bounding box from your two coordinate points
2. Calculate required map tiles for the area
3. Expand to 3x3 grid pattern (if enabled)
4. Download all tiles in parallel
5. Stitch them together into a single high-resolution PNG
6. Save as `{areaName}_{provider}_zoom{zoom}.png`

## Output Examples

- `downtown_geoapify_zoom18.png` - Downtown area in street map view at zoom 18
- `central_park_esri_zoom16.png` - Central Park in satellite view at zoom 16

## Configuration Options

### Provider Options

| Provider | Type | Resolution | Credit Card? | Best For |
|----------|------|------------|--------------|----------|
| **`esri`** ⭐ | Satellite | 256x256 tiles | ❌ NO | FREE satellite imagery, no limits |
| `mapbox` | Satellite | 512x512 @2x tiles | ✅ YES (even for free tier) | Higher res, 50k tiles/month |
| `geoapify` | Street Map | 256x256 tiles | ❌ NO | Street-level detail, roads |

### Zoom Levels

- **15**: City-wide view (~5km coverage)
- **16**: Neighborhood view (~2.5km coverage)
- **17**: Street-level view (~1.2km coverage)
- **18**: High detail (~600m coverage) - **Recommended**
- **19-21**: Extreme detail (limited availability)

Higher zoom = more detail but more tiles = more API calls

### Provider-Specific Settings

#### ESRI (Recommended)
- No configuration needed!
- Just set `provider: 'esri'`

#### Mapbox Styles (if using Mapbox)
- `satellite-v9` - Pure satellite imagery (clean, no labels)
- `satellite-streets-v12` - Satellite + street labels and roads

## Troubleshooting

### "Invalid API key" Error (Mapbox only)
- Make sure you've replaced `YOUR_MAPBOX_TOKEN_HERE` with your actual token
- Verify the token is active at https://account.mapbox.com/access-tokens/
- **Or switch to ESRI**: Set `provider: 'esri'` for no API key needed!

### Out of Memory Error / "Area too large" Error
**This happens when your area is too big for the zoom level!**

The tool will show you how many tiles you're trying to download. Solutions:

1. **Reduce area size** (Best solution):
   ```javascript
   // At zoom 18, keep areas to ~0.01° difference (about 1km)
   point1: { lat: 34.0422, lon: -118.2537 }
   point2: { lat: 34.0522, lon: -118.2437 }
   ```

2. **Lower zoom level**:
   ```javascript
   zoom: 16,  // Instead of 18
   ```

3. **Disable 3x3 grid** (covers less area):
   ```javascript
   use3x3Grid: false,
   ```

4. **Increase tile limit** (if you have lots of RAM):
   ```javascript
   maxTiles: 10000,  // Default is 5000
   ```

### Image Doesn't Cover Full Area
- **Enable 3x3 grid**: Set `use3x3Grid: true` (should already be enabled by default)
- **Expand area**: Move your two coordinate points further apart
- **Lower `zoom` level**: Try zoom 17 or 16 for wider coverage per tile
- **Check the logs**: The console shows the center area and full grid coverage

Example:
```javascript
use3x3Grid: true,  // Ensures full coverage
zoom: 17,          // Wider area per tile
```

### Image Quality Too Low
- Increase the `zoom` level (try 19 or 20)
- Note: Higher zoom may not be available in all areas

### Too Many Tiles / Rate Limit
- Reduce the `zoom` level
- Process fewer areas at once
- Define smaller areas (closer coordinate points)
- Mapbox free tier: 50,000 tiles/month

### Missing Dependencies
```bash
npm install axios sharp
```

## How It Works

1. **Bounding Box Creation**: Creates rectangular area from your two coordinate points
2. **Tile Calculation**: Determines which map tiles cover the defined area
3. **3x3 Grid Expansion**: Extends coverage to include 8 surrounding areas of equal size
4. **Parallel Download**: Fetches all tiles simultaneously (9x your defined area)
5. **Stitching**: Uses Sharp library to composite all tiles into one seamless image
6. **Output**: Saves high-resolution PNG with complete coverage

## Example Output

The generated images will show:
- **ESRI**: High-resolution satellite/aerial photography (FREE, unlimited!)
- **Mapbox**: High-resolution satellite/aerial photography (requires credit card)
- **Geoapify**: Detailed street maps with roads, buildings, labels

Perfect for:
- Property analysis
- Urban planning
- Real estate documentation
- Geographic research
- Area visualization

## Usage Estimates

For a typical area at zoom 18 with 3x3 grid enabled:
- Small area (0.01° x 0.01°): ~180-450 tiles (9x coverage)
- Medium area (0.02° x 0.02°): ~450-1,350 tiles (9x coverage)
- Large area (0.05° x 0.05°): ~1,350-4,500 tiles (9x coverage)

**Note**: 3x3 grid downloads 9x more tiles (center + 8 surrounding areas) to ensure complete coverage.

**Tile count depends on:**
- Distance between your two coordinate points
- Zoom level (higher = more tiles)
- Whether 3x3 grid is enabled

**Provider limits:**
- **Geoapify** (street maps): Free tier available
- **ESRI** (satellite): No known rate limits - truly unlimited and free!
- **Mapbox** free tier: 50,000 tiles/month (~11-370 areas with 3x3 grid)

## License

MIT
