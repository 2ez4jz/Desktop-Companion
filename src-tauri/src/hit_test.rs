/// Physical cursor -> logical window -> 128x128 alpha silhouette.
/// Kept free of OS dependencies so correctness can be unit-tested separately.
pub fn hit(mask: &[u8], x: f64, y: f64, width: f64, height: f64) -> bool {
    if (mask.len() != 128 * 128 && mask.len() != 2048)
        || !x.is_finite()
        || !y.is_finite()
        || width <= 0.0
        || height <= 0.0
        || x < 0.0
        || y < 0.0
        || x >= width
        || y >= height
    {
        return false;
    }
    let col = (x / width * 128.0) as usize;
    let row = (y / height * 128.0) as usize;
    let index = row * 128 + col;
    if mask.len() == 2048 {
        mask[index >> 3] & (1 << (index & 7)) != 0
    } else {
        mask[index] != 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transparent_pixels_and_outside_window_pass_through() {
        let mut mask = vec![0; 128 * 128];
        mask[64 * 128 + 64] = 1;
        assert!(hit(&mask, 260., 260., 520., 520.));
        assert!(!hit(&mask, 10., 10., 520., 520.));
        assert!(!hit(&mask, -1., 260., 520., 520.));
        assert!(!hit(&mask, 520., 260., 520., 520.));
        assert!(!hit(&mask, f64::NAN, 260., 520., 520.));
    }
    #[test]
    fn packed_mask_matches_unpacked() {
        let mut mask = vec![0u8; 2048];
        let index = 64 * 128 + 64;
        mask[index >> 3] |= 1 << (index & 7);
        assert!(hit(&mask, 260., 260., 520., 520.));
        assert!(!hit(&mask, 10., 10., 520., 520.));
    }
    #[test]
    fn logical_mapping_survives_dpi_conversion() {
        let mut mask = vec![0; 128 * 128];
        mask[64 * 128 + 64] = 1;
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let physical_cursor_x = -1920.0 + 260.0 * scale;
            assert!(hit(
                &mask,
                (physical_cursor_x + 1920.0) / scale,
                260.,
                520.,
                520.
            ));
        }
    }
}
