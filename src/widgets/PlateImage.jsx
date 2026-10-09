import { useEffect, useState } from 'react';
import { imagePlateClass, plateRasterNeedsCheck, rasterPlateClass } from '../lib/mediaPlate';

/**
 * An <img> that knows what should sit behind it (issue #111).
 *
 * The vector case is settled by the URL alone (`imagePlateClass`), so it is on the first paint. A
 * transparent raster cannot be: the corners and the ink are only readable once the browser has decoded
 * pixels, so this asks `rasterPlateClass` — cached and queued — and adds the class when the answer comes
 * back. Nothing is blocked on it: until then the image keeps the card's background, i.e. the old behaviour.
 *
 * The answer carries a DIRECTION, because transparency alone does not mean "wants white": dark ink gets the
 * light plate, light ink (white line art, which a white plate would swallow) keeps the dark background.
 *
 * `choice` is the card's `mediaBackground`; `undefined` means `auto`, which is what a card whose type does
 * not offer the field should do.
 */
export function PlateImage({ choice, className = '', src, ...rest }) {
  const vectorClass = imagePlateClass(choice, src);
  const [rasterClass, setRasterClass] = useState('');

  useEffect(() => {
    if (vectorClass || !plateRasterNeedsCheck(choice, src)) {
      setRasterClass('');
      return undefined;
    }
    let alive = true;
    rasterPlateClass(src).then((plate) => {
      if (alive) setRasterClass(plate || '');
    });
    return () => {
      alive = false;
    };
  }, [choice, src, vectorClass]);

  return <img className={className + (vectorClass || rasterClass)} src={src} {...rest} />;
}

export default PlateImage;
