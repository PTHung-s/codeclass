import { ArenaCreateForm } from "../../components/arena/browse/ArenaCreateForm";
import { DEBUG_ARENA } from "../../components/arena/browse/arenaBrowseConfig";

export default function ArenaCreate() {
  return <ArenaCreateForm cfg={DEBUG_ARENA} />;
}
