/**
 * Netflix keeps seeking state in a page-global player API. In the userscript
 * this code runs in MAIN world; userscript managers expose the same object via
 * unsafeWindow while privileged GM APIs keep the rest of the script sandboxed.
 */
(function installNetflixPageApiBridge() {
  if (location.hostname !== "www.netflix.com") {
    return;
  }
  const pageWindow =
    typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  pageWindow.addEventListener(
    "message",
    (event) => {
      if (
        event.source !== pageWindow ||
        event.origin !== "https://www.netflix.com" ||
        event.data?.action !== "hml5speed-seek" ||
        !event.data.seekMs
      ) {
        return;
      }
      try {
        const videoPlayer =
          pageWindow.netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const playerSessionId = videoPlayer.getAllPlayerSessionIds()[0];
        const currentTime =
          videoPlayer.getCurrentTimeBySessionId(playerSessionId);
        videoPlayer
          .getVideoPlayerBySessionId(playerSessionId)
          .seek(currentTime + event.data.seekMs);
      } catch (error) {
        window.VSC.logger?.warn(`Netflix API seek failed: ${error.message}`);
      }
    },
    false,
  );
})();
