import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/AuthContext";
import api from "../../lib/api";

/** Role-aware entry point: staff without a started match go to the authoring
 * studio; everyone else goes to the game view. */
export default function CodeDuelDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    const isStaff = ["teacher", "admin", "teaching_assistant"].includes(user?.role || "");
    api
      .get<{ match: { status: string } }>(`/code-duel/${id}`)
      .then((res) => {
        const status = res.data?.match?.status;
        if (isStaff && status === "draft") {
          navigate(`/code-duel/${id}/authoring`);
        } else {
          navigate(`/code-duel/${id}/game`);
        }
      })
      .catch(() => navigate("/code-duel"));
  }, [id, user?.role]);

  return <div className="py-16 text-center text-muted-foreground">Đang chuyển...</div>;
}