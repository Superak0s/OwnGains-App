import { Image } from "react-native"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import { captureException, metric } from "@shared/services/crashReporting"

// Camera/gallery photos come in at full sensor resolution (often several MB).
// Uploading that raw is what made progress-photo saves "giga slow" over
// mobile networks, so this downsizes + recompresses before any upload.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.6
// Grid tiles are ~150dp wide, so this remains sharp at 3x density.
const THUMB_DIMENSION = 400

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    )
  })
}

export async function compressImageForUpload(uri: string): Promise<string> {
  try {
    const { width, height } = await getImageSize(uri)
    // Resizing on one axis preserves the aspect ratio, so the longer side is
    // the one that has to be capped, since progress photos are usually portrait.
    const resized = Math.max(width, height) > MAX_DIMENSION
    const context = ImageManipulator.manipulate(uri)
    if (resized) {
      context.resize(
        width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION },
      )
    }
    const image = await context.renderAsync()
    const result = await image.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    })
    metric.count("image.compressed", 1, {
      attributes: { resized },
    })
    return result.uri
  } catch (error) {
    console.error("Error compressing image, uploading original:", error)
    metric.count("image.compress_failed")
    captureException(error, { stage: "compressImageForUpload" })
    return uri
  }
}

export async function makeThumbnail(uri: string): Promise<string | null> {
  try {
    const { width, height } = await getImageSize(uri)
    const context = ImageManipulator.manipulate(uri)
    if (Math.max(width, height) > THUMB_DIMENSION) {
      context.resize(
        width >= height ? { width: THUMB_DIMENSION } : { height: THUMB_DIMENSION },
      )
    }
    const image = await context.renderAsync()
    const result = await image.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    })
    return result.uri
  } catch (error) {
    captureException(error, { stage: "makeThumbnail" })
    return null
  }
}
