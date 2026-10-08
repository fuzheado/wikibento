import { useEffect, useState } from 'react';
import { imagePlateClass, plateAlphaNeeded, plateRasterNeedsCheck } from '../lib/mediaPlate';

/**
 * An <img> that knows what should sit behind it (issue #111).
 *
 * The vector case is settled by the URL alone (`imagePlateClass`), so it is on the first paint. A
 * transparent raster cannot be: the corners are only readable once the browser has decoded pixels, so this
 * asks `plateAlphaNeeded` — cached and queued — and adds the class when the answer comes back. Nothing is
 * blocked on it: until then the image keeps the card's background, i.e. exactly the old behaviour.
 *
 * `choice` is the card's `mediaBackground`; `undefined` means `auto`, which is what a card whose type does
 * not offer the field should do.
 */
export function PlateImage({ choice, className = '', src, ...rest }) {
  const vectorClass = imagePlateClass(choice, src);
  const [alphaPlate, setAlphaPlate] = useState(false);

  useEffect(() => {
    if (vectorClass || !plateRasterNeedsCheck(choice, src)) {
      setAlphaPlate(false);
      return undefined;
    }
    let alive = true;
    plateAlphaNeeded(src).then((needs) => {
      if (alive) setAlphaPlate(needs === true);
    });
    return () => {
      alive = false;
    };
  }, [choice, src, vectorClass]);

  const plate = vectorClass || (alphaPlate ? ' plate-alpha' : '');
  return <img className={className + plate} src={src} {...rest} />;
}

export default PlateImage;
