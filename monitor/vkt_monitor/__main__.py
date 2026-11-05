"""python -m vkt_monitor  (chạy từ thư mục monitor/)"""
import sys

from . import bridge, config, hud


def main(argv):
    cfg = config.load()
    if "--launch" in argv:
        err = bridge.launch_edge(cfg)
        if err:
            print(err)
    hud.run()


if __name__ == "__main__":
    main(sys.argv[1:])
