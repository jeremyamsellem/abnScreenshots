# High-Resolution Map Capture Tool

Automatically capture high-definition satellite or street map images for zip codes by stitching together map tiles.

## Features

- ✅ **100% FREE**: No credit card required for street maps or satellite imagery!
- ✅ **3x3 Grid Coverage**: Downloads center area + 8 surrounding areas for complete coverage
- ✅ **Three providers**: Geoapify (street maps), ESRI (satellite), or Mapbox (satellite)
- ✅ **High resolution**: High-quality imagery at zoom 18
- ✅ **Batch processing**: Process multiple zip codes at once
- ✅ **Automatic stitching**: Seamlessly combines tiles into one image
- ✅ **No API key needed**: Works out of the box!

## Setup

### 1. Install Dependencies

```bash
npm install axios sharp
```

### 2. Configure (Optional - works out of the box!)

Edit `index.js` and update the `CONFIG` object:

```javascript
const CONFIG = {
    provider: 'geoapify',  // Street maps (or 'esri' for satellite)
    zipCodes: ['07030', '10001'],  // Add your zip codes
    zoom: 18,  // 18 = high detail, 15 = wider area
    use3x3Grid: true,  // Download center + 8 surrounding areas (recommended!)
};
```

## How the 3x3 Grid Works

The tool downloads a 3×3 grid pattern where:
```
[Area] [Area] [Area]
[Area] [ZIP]  [Area]  ← ZIP = your zip code area
[Area] [Area] [Area]
```

Each area has the same width and height as the zip code's bounding box, ensuring complete coverage of the entire region and surrounding context.

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
1. Geocode each zip code to get coordinates
2. Calculate required map tiles for the area
3. Download all tiles in parallel
4. Stitch them together into a single high-resolution PNG
5. Save as `{zipCode}_{provider}_zoom{zoom}.png`

## Output Examples

- `07030_esri_zoom18.png` - Hoboken, NJ in satellite view at zoom 18
- `10001_geoapify_zoom16.png` - NYC in street map view at zoom 16

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

### Image Doesn't Cover Full Zip Code Area
- **Enable 3x3 grid**: Set `use3x3Grid: true` (should already be enabled by default)
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
- Process fewer zip codes at once
- Mapbox free tier: 50,000 tiles/month

### Missing Dependencies
```bash
npm install axios sharp
```

## How It Works

1. **Geocoding**: Converts zip code to lat/lon coordinates and bounding box
2. **Tile Calculation**: Determines which map tiles cover the zip code area
3. **3x3 Grid Expansion**: Extends coverage to include 8 surrounding areas of equal size
4. **Parallel Download**: Fetches all tiles simultaneously (9x the zip code area)
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

For a typical zip code area at zoom 18 with 3x3 grid enabled:
- Small zip code: ~180-450 tiles (9x coverage)
- Medium zip code: ~450-1,350 tiles (9x coverage)
- Large zip code: ~1,350-4,500 tiles (9x coverage)

**Note**: 3x3 grid downloads 9x more tiles (center + 8 surrounding areas) to ensure complete coverage.

**Geoapify** (street maps): Free tier available
**ESRI** (satellite): No known rate limits - truly unlimited and free!
**Mapbox** free tier (50,000 tiles/month): ~11-370 zip codes depending on size with 3x3 grid

## License

MIT
