import { useEffect, useRef, useState } from "react";
type Player = { destroy(): void };
type API = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host: string;
      playerVars: { origin: string };
      events: { onError: (event: { data: number }) => void };
    },
  ) => Player;
};
declare global {
  interface Window {
    YT?: API;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ready: Promise<API> | undefined;
function loadAPI() {
  if (window.YT) return Promise.resolve(window.YT);
  if (!ready)
    ready = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        ready = undefined;
        script.remove();
        reject(new Error("Não foi possível carregar o player."));
      };
      document.head.append(script);
    });
  return ready;
}
export function YouTube({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let player: Player | undefined;
    const mount = document.createElement("div");
    ref.current!.append(mount);
    loadAPI()
      .then((api) => {
        if (!active) return;
        player = new api.Player(mount, {
          videoId: id,
          host: "https://www.youtube.com",
          playerVars: { origin: location.origin },
          events: {
            onError: (e) =>
              setError(
                [101, 150, 153].includes(e.data)
                  ? "O YouTube restringiu a incorporação. Abra a aula no YouTube."
                  : "Vídeo indisponível neste player. Tente abrir no YouTube.",
              ),
          },
        });
      })
      .catch(() => {
        if (active)
          setError("Não foi possível carregar o player. Abra no YouTube.");
      });
    return () => {
      active = false;
      player?.destroy();
      mount.remove();
    };
  }, [id]);
  return (
    <div className="video">
      <div ref={ref} />
      {error && <p role="status">{error}</p>}
    </div>
  );
}
