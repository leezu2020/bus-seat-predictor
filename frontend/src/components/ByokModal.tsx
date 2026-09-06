import React, { useState, useEffect } from 'react';
import { Key, Shield, AlertCircle, Check, X, Trash2, ExternalLink } from 'lucide-react';
import { getStoredApiKey, setStoredApiKey } from '../api/client';

interface ByokModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ByokModal: React.FC<ByokModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredApiKey() || '');
      setIsSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setStoredApiKey(apiKey);
    setIsSaved(true);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 600);
  };

  const handleClear = () => {
    setStoredApiKey(null);
    setApiKey('');
    setIsSaved(true);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 600);
  };

  const handleUseDemo = () => {
    setApiKey('DEMO_KEY');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl relative flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <Key className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white">Bring Your Own Key (BYOK) 설정</h3>
            <p className="text-xs text-slate-400">공공데이터포털 개인 API 인증키 관리</p>
          </div>
        </div>

        {/* Security Assurance Notice */}
        <div className="bg-slate-950/70 rounded-xl p-3 sm:p-3.5 border border-slate-800 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
          <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-emerald-400 block mb-0.5">무상태(Stateless) 프록시 보안 원칙</strong>
            입력하신 공공데이터 인증키는 백엔드 서버의 데이터베이스나 로그에 절대 기록되지 않습니다.
            브라우저 로컬 스토리지에만 보관되며, GBIS 호출 시에만 무상태 프록시를 통해 대리 호출됩니다.
          </div>
        </div>

        {/* Key Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-200 mb-1.5">
            공공데이터포털 일반 인증키 (Encoding / Decoding)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="공공데이터포털에서 발급받은 serviceKey를 입력하세요"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition font-mono"
          />
        </div>

        {/* Error Policy Information */}
        <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            공공데이터 API 트래픽 한도 및 오류 안내
          </div>
          <p>
            • <strong>오류 코드 22:</strong> 1일 쿼터 초과 시 429 Too Many Requests 상태로 페일오버됩니다.
          </p>
          <p>
            • <strong>오류 코드 30:</strong> 미등록 키 전달 시 401 Unauthorized 에러로 감지됩니다.
          </p>
          <p>
            • 키가 없거나 테스트 시에는 아래 <strong>'모의 키(DEMO_KEY)'</strong>를 선택하여 실감나는 모의 운행 데이터를 확인할 수 있습니다.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <button
              type="button"
              onClick={handleUseDemo}
              className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-2 py-1"
            >
              모의 키(DEMO_KEY) 주입
            </button>
            {apiKey && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 ml-2 py-1"
              >
                <Trash2 className="w-3 h-3" /> 삭제
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 sm:border-transparent transition text-center"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20 transition flex items-center justify-center gap-1.5"
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5" /> 저장 완료
                </>
              ) : (
                '인증키 저장'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
