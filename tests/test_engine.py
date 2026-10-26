import copy
import unittest
from releasegate.engine import evaluate, fixture, gate, load, retrieve, score

class EvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policies=load('data/policies.json')
        cls.cases=load('data/cases.json')
        cls.baseline=evaluate(load('configs/baseline.json'),cls.cases,cls.policies)
        cls.fixed=evaluate(load('configs/fixed.json'),cls.cases,cls.policies)
        cls.bad=evaluate(load('configs/regression.json'),cls.cases,cls.policies)
    def test_tenant_filter_precedes_retrieval(self):
        self.assertEqual(retrieve('private customer address',self.policies,100),[])
    def test_exclusion_overrides_general_coverage(self):
        c=retrieve('collision commercial',self.policies,3)
        self.assertEqual(fixture(c,'evidence')['decision'],'excluded')
    def test_missing_evidence_abstains(self):
        self.assertEqual(fixture([],'evidence')['decision'],'unknown')
    def test_bad_candidate_blocked_and_fixed_approved(self):
        self.assertEqual(gate(self.baseline,self.bad)['status'],'blocked')
        self.assertEqual(gate(self.baseline,self.fixed)['status'],'approved')
    def test_fabricated_citation_is_rejected(self):
        row=self.cases[0]
        self.assertFalse(score(row,{'decision':'covered','citations':['FAKE'],'answer':'ok'},self.policies)['citation'])
    def test_correct_answer_without_evidence_fails(self):
        row=self.cases[0]
        self.assertFalse(score(row,{'decision':'covered','citations':[],'answer':'ok'},[])['passed'])
    def test_invalid_schema_is_failure(self):
        for output in ({},None,{'decision':'covered','citations':'POL-01','answer':'ok'}):
            self.assertFalse(score(self.cases[0],output,[])['passed'])
    def test_comparison_requires_identical_dataset(self):
        altered=copy.deepcopy(self.fixed)
        altered['provenance']['dataset_sha256']='changed'
        self.assertEqual(gate(self.baseline,altered)['status'],'blocked')
    def test_holdout_has_all_categories_and_no_duplicate_questions(self):
        self.assertEqual(len({c['question'] for c in self.cases}),len(self.cases))
        self.assertEqual({c['category'] for c in self.cases if c['split']=='holdout'}, {c['category'] for c in self.cases if c['split']=='dev'})

if __name__=='__main__': unittest.main()
