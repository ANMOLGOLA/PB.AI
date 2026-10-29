import re
from typing import Dict, Any, Set, List

STOPWORDS: Set[str] = {
    "what", "is", "the", "in", "a", "an", "and", "or", "of", "to", "for",
    "which", "how", "when", "where", "why", "that", "this", "with", "does",
    "do", "are", "can", "could", "would", "should", "from", "by", "at", "as",
    "be", "on", "if", "it", "its", "into", "their", "then", "there", "about"
}


def _tokenize(text: str) -> Set[str]:
    """Tokenize text into lowercase alpha-numeric words omitting common stopwords."""
    if not text:
        return set()
    cleaned = re.sub(r"[^\w\s-]", " ", text.lower())
    words = cleaned.split()
    return {w for w in words if len(w) >= 3 and w not in STOPWORDS}


def calculate_query_question_similarity(query: str, question_text: str) -> Dict[str, Any]:
    """
    Computes lexical and semantic overlap between an intercepted web search query
    and the candidate's active assessment question prompt.

    Flags queries resembling the assessment question as 'likely answer-seeking'.
    """
    if not query or not question_text:
        return {
            "similarity_score": 0.0,
            "is_likely_seeking": False,
            "matched_tokens": [],
            "overlap_count": 0
        }

    q_tokens = _tokenize(query)
    quest_tokens = _tokenize(question_text)

    if not q_tokens or not quest_tokens:
        return {
            "similarity_score": 0.0,
            "is_likely_seeking": False,
            "matched_tokens": [],
            "overlap_count": 0
        }

    intersection = q_tokens.intersection(quest_tokens)
    union = q_tokens.union(quest_tokens)

    jaccard = len(intersection) / len(union) if union else 0.0
    query_overlap = len(intersection) / len(q_tokens) if q_tokens else 0.0

    # Substring containment check for continuous phrases
    normalized_query = " ".join(query.lower().split())
    normalized_quest = " ".join(question_text.lower().split())
    phrase_match = len(normalized_query) >= 15 and normalized_query in normalized_quest

    # Determination criteria:
    # 1. 3 or more substantive domain keywords match
    # 2. More than 45% of the query keywords match the question
    # 3. Direct multi-word phrase containment
    is_likely_seeking = bool(
        len(intersection) >= 3 or
        (query_overlap >= 0.45 and len(intersection) >= 2) or
        phrase_match or
        jaccard >= 0.30
    )

    score = round(min(1.0, max(jaccard, query_overlap, 0.85 if phrase_match else 0.0)), 2)

    return {
        "similarity_score": score,
        "is_likely_seeking": is_likely_seeking,
        "matched_tokens": sorted(list(intersection)),
        "overlap_count": len(intersection)
    }
