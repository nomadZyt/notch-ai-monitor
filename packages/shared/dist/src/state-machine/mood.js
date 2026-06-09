export const MOOD_BY_EVENT_TYPE = {
    risk: "angry",
    confirm: "waiting",
    result: "happy",
    error: "sad",
};
export function moodForEvent(event) {
    if (!event)
        return "none";
    return MOOD_BY_EVENT_TYPE[event.type];
}
export function restingStateForMood(mood) {
    if (mood === "none")
        return "dormant";
    if (mood === "angry")
        return "peek";
    return "glance";
}
