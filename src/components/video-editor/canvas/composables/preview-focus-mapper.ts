import type { VisualClip } from '~/media/shared/composition-types';
import { frameMediaRect } from '../../composition/appearance/frames';
import { isPhoneFrame } from '../../composition/appearance/phone-frames';
import { mapSourcePointToScreen, resolveScreenRenderGeometry } from '../../composition/camera-layout';
import type { ZoomFocusMapper } from '../../zoom/zoom-types';

/**
 * Maps an automatic zoom's source point onto the preview's screen window, including a phone
 * frame's inset media. A manual zoom's focus is already in screen space and passes through.
 */
export const createPreviewFocusMapper =
  (params: {
    screenAt: (timeMs: number) => VisualClip | null;
    videoWidth: number;
    videoHeight: number;
    windowWidth: number;
    windowHeight: number;
    showBackground: boolean;
  }): ZoomFocusMapper =>
  (focus, zoom, timeMs) => {
    const activeScreen = params.screenAt(timeMs);
    if (!activeScreen || zoom.mode !== 'auto') return focus;
    const activeGeometry = resolveScreenRenderGeometry(
      activeScreen,
      params.videoWidth,
      params.videoHeight,
      params.windowWidth,
      params.windowHeight,
      params.showBackground,
    );
    const positioned = isPhoneFrame(activeScreen.appearance.frame)
      ? frameMediaRect(
          activeGeometry.positioned,
          activeScreen.appearance.frame,
          activeGeometry.source.width,
          activeGeometry.source.height,
        )
      : activeGeometry.positioned;
    return mapSourcePointToScreen(
      focus,
      params.videoWidth,
      params.videoHeight,
      params.windowWidth,
      params.windowHeight,
      { ...activeGeometry, positioned },
    );
  };
