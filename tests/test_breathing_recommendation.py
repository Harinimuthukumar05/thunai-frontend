import re
import unittest
from pathlib import Path


class BreathingRecommendationLogicTest(unittest.TestCase):
    def test_should_not_use_daily_session_suppression(self):
        source_path = Path(__file__).resolve().parent.parent / 'Chatoffline.js'
        source = source_path.read_text(encoding='utf-8')

        function_match = re.search(r'function _shouldRecommendBreathing\(text, emotion\) \{.*?\n\}', source, re.S)
        self.assertIsNotNone(function_match, 'Could not find _shouldRecommendBreathing in Chatoffline.js')

        function_body = function_match.group(0)
        self.assertNotIn('todayKey', function_body)
        self.assertNotIn('thunai_breathing_recommended', function_body)
        self.assertNotIn('sessionStorage.getItem', function_body)
        self.assertNotIn('sessionStorage.setItem', function_body)


if __name__ == '__main__':
    unittest.main()
