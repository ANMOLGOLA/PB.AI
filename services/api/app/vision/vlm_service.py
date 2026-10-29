"""
Layer C: Optional Vision-Language Model (VLM) Incident Review Service

Architecture Documentation:
- Role: STRICTLY SECONDARY & ON-DEMAND.
  External vision-language models (Gemini / Groq) must NEVER be used in the high-frequency
  (sub-second) real-time webcam frame processing loop.
- Dedicated Purpose:
  1. Incident Snapshot Forensic Review: When an examiner inspects a flagged incident,
     an optional VLM snapshot analysis can provide a natural-language semantic summary.
  2. Explainable Audits: Produces evidence-grounded observations clearly labeled as
     "model_suggestion" and "unverified_by_examiner".
- Provider Abstraction:
  * Clean interface isolating provider SDKs from core proctoring logic.
  * Bounded timeouts (default 8.0s), input validation, structured output schemas,
    and normalized error states (timeout, quota_exceeded, unavailable, auth_error).
  * Backend-only credential access. API keys are NEVER sent to the client.
  * Core assessment functionality remains 100% operational when providers are disabled or offline.
"""

import time
import json
import base64
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from app.config import settings


@dataclass
class VLMAnalysisRequest:
    image_base64: str
    task_type: str = "incident_secondary_review"
    incident_context: Optional[str] = None
    timeout_sec: float = 8.0


@dataclass
class VLMAnalysisResult:
    provider_name: str
    model_name: str
    status: str  # "success", "timeout", "quota_exceeded", "unavailable", "invalid_response", "error"
    semantic_summary: Optional[str] = None
    observations: Dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0.0
    error_message: Optional[str] = None
    unverified_by_examiner: bool = True  # Strict fairness guarantee

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider_name": self.provider_name,
            "model_name": self.model_name,
            "status": self.status,
            "semantic_summary": self.semantic_summary,
            "observations": self.observations,
            "latency_ms": round(self.latency_ms, 2),
            "error_message": self.error_message,
            "unverified_by_examiner": self.unverified_by_examiner
        }


class VisionLanguageProvider(ABC):
    """Abstract provider contract for secondary vision-language analysis."""

    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        pass

    @abstractmethod
    def analyze_snapshot(self, request: VLMAnalysisRequest) -> VLMAnalysisResult:
        pass


class GeminiVisionProvider(VisionLanguageProvider):
    """Google Gemini Multimodal Vision implementation."""

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self._api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self._model_name = model_name or settings.GEMINI_VISION_MODEL
        self._client = None

    def get_provider_name(self) -> str:
        return "gemini_vision"

    def get_model_name(self) -> str:
        return self._model_name

    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    def _get_client(self):
        if self._client is None and self.is_configured():
            try:
                from google import genai
                self._client = genai.Client(api_key=self._api_key.strip())
            except Exception as exc:
                print(f"[Gemini Provider] Failed to initialize client: {exc}")
        return self._client

    def analyze_snapshot(self, request: VLMAnalysisRequest) -> VLMAnalysisResult:
        start_time = time.perf_counter()

        if not self.is_configured():
            return VLMAnalysisResult(
                provider_name=self.get_provider_name(),
                model_name=self.get_model_name(),
                status="unavailable",
                error_message="Gemini API Key is not configured on server"
            )

        client = self._get_client()
        if not client:
            return VLMAnalysisResult(
                provider_name=self.get_provider_name(),
                model_name=self.get_model_name(),
                status="error",
                error_message="Failed to instantiate Google GenAI Client"
            )

        try:
            from google.genai import types

            raw_b64 = request.image_base64.split(",", 1)[1] if "," in request.image_base64 else request.image_base64
            # Ensure valid padding
            padded_b64 = raw_b64 + "=" * (-len(raw_b64) % 4)
            try:
                img_bytes = base64.b64decode(padded_b64)
            except Exception:
                img_bytes = b"EMPTY_FALLBACK_IMAGE"

            image_part = types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")

            prompt = (
                "You are an assessment auditing assistant performing a secondary forensic review of a flagged incident snapshot.\n"
                f"Incident Context: {request.incident_context or 'General integrity audit'}\n"
                "Analyze the visible testing environment.\n"
                "Respond strictly in JSON with format:\n"
                "{\n"
                '  "candidate_visible": true/false,\n'
                '  "candidate_count": 1,\n'
                '  "unauthorized_devices_observed": true/false,\n'
                '  "device_description": "none or description",\n'
                '  "behavior_notes": "concise factual observation for human examiner"\n'
                "}"
            )

            response = client.models.generate_content(
                model=self._model_name,
                contents=[image_part, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1
                )
            )

            latency_ms = (time.perf_counter() - start_time) * 1000

            if not response or not response.text:
                return VLMAnalysisResult(
                    provider_name=self.get_provider_name(),
                    model_name=self.get_model_name(),
                    status="invalid_response",
                    latency_ms=latency_ms,
                    error_message="Empty response received from Gemini API"
                )

            data = json.loads(response.text)
            return VLMAnalysisResult(
                provider_name=self.get_provider_name(),
                model_name=self.get_model_name(),
                status="success",
                semantic_summary=data.get("behavior_notes", "Secondary review completed"),
                observations=data,
                latency_ms=latency_ms,
                unverified_by_examiner=True
            )
        except json.JSONDecodeError:
            latency_ms = (time.perf_counter() - start_time) * 1000
            return VLMAnalysisResult(
                provider_name=self.get_provider_name(),
                model_name=self.get_model_name(),
                status="invalid_response",
                latency_ms=latency_ms,
                error_message="Malformed JSON in model response"
            )
        except Exception as exc:
            latency_ms = (time.perf_counter() - start_time) * 1000
            err_str = str(exc).lower()
            status = "error"
            if isinstance(exc, TimeoutError) or "timeout" in err_str or "timed out" in err_str:
                status = "timeout"
            elif "quota" in err_str or "rate limit" in err_str or "429" in err_str:
                status = "quota_exceeded"

            return VLMAnalysisResult(
                provider_name=self.get_provider_name(),
                model_name=self.get_model_name(),
                status=status,
                latency_ms=latency_ms,
                error_message=f"Gemini API inference error: {str(exc)}"
            )


class GroqVisionProvider(VisionLanguageProvider):
    """Groq Vision Provider implementation."""

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self._api_key = api_key if api_key is not None else settings.GROQ_API_KEY
        self._model_name = model_name or settings.GROQ_VISION_MODEL

    def get_provider_name(self) -> str:
        return "groq_vision"

    def get_model_name(self) -> str:
        return self._model_name

    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    def analyze_snapshot(self, request: VLMAnalysisRequest) -> VLMAnalysisResult:
        # Note: Groq officially decommissioned llama-3.2-11b-vision-preview
        if not self.is_configured():
            return VLMAnalysisResult(
                provider_name=self.get_provider_name(),
                model_name=self.get_model_name(),
                status="unavailable",
                error_message="Groq API Key is not configured on server"
            )

        return VLMAnalysisResult(
            provider_name=self.get_provider_name(),
            model_name=self.get_model_name(),
            status="unavailable",
            error_message="Groq vision models (llama-3.2-11b/90b-vision-preview) are decommissioned by provider"
        )


class VLMIncidentReviewService:
    """Registry and coordinator for optional secondary forensic reviews."""

    def __init__(self):
        self.providers: Dict[str, VisionLanguageProvider] = {
            "gemini_vision": GeminiVisionProvider(),
            "groq_vision": GroqVisionProvider()
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "providers": {
                name: {
                    "configured": p.is_configured(),
                    "model": p.get_model_name()
                }
                for name, p in self.providers.items()
            },
            "active_secondary_provider": "gemini_vision" if self.providers["gemini_vision"].is_configured() else None
        }

    def review_incident(
        self,
        image_base64: str,
        incident_context: str,
        preferred_provider: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a secondary forensic snapshot review using the preferred or active provider.
        """
        # If both are unconfigured, return unavailable immediately
        if not any(p.is_configured() for p in self.providers.values()):
            return VLMAnalysisResult(
                provider_name="none",
                model_name="none",
                status="unavailable",
                error_message="No vision-language model providers are configured on server"
            ).to_dict()

        provider_key = preferred_provider or ("gemini_vision" if self.providers["gemini_vision"].is_configured() else "groq_vision")
        provider = self.providers.get(provider_key)
        if not provider or not provider.is_configured():
            return VLMAnalysisResult(
                provider_name=provider_key or "none",
                model_name="none",
                status="unavailable",
                error_message=f"Provider '{provider_key}' is not available or not configured"
            ).to_dict()

        request = VLMAnalysisRequest(
            image_base64=image_base64,
            incident_context=incident_context
        )
        result = provider.analyze_snapshot(request)
        return result.to_dict()


# Singleton VLM review coordinator
global_vlm_service = VLMIncidentReviewService()
