import { ArenaRoomList } from "../../components/arena/browse/ArenaRoomList";
import { DEBUG_ARENA } from "../../components/arena/browse/arenaBrowseConfig";

export default function ArenaList() {
  return <ArenaRoomList cfg={DEBUG_ARENA} />;
}
