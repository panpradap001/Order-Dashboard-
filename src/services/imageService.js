import { storage } from "../config/firebase.js";
import { ref as storageRef, getDownloadURL } from "firebase/storage";
import { state } from "../store/state.js";

export async function getProductImageUrl(pCode) {
  if (state.imageCache[pCode]) {
    return state.imageCache[pCode];
  }
  
  try {
    const jpgRef = storageRef(storage, `picture/${pCode}.jpg`);
    const url = await getDownloadURL(jpgRef);
    state.imageCache[pCode] = url;
    return url;
  } catch (err) {
    try {
      const pngRef = storageRef(storage, `picture/${pCode}.png`);
      const url = await getDownloadURL(pngRef);
      state.imageCache[pCode] = url;
      return url;
    } catch (err2) {
      const fallbackUrl = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='%23eee'/><text x='80' y='80' font-family='Arial' font-size='14' fill='%23999' text-anchor='middle' alignment-baseline='middle'>No Image</text></svg>";
      state.imageCache[pCode] = fallbackUrl;
      return fallbackUrl;
    }
  }
}
