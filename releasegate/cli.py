import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from .engine import ROOT, evaluate, gate, load

def main():
    parser=argparse.ArgumentParser(description='Evaluate candidates and build a static dashboard report')
    parser.add_argument('--candidate',choices=['baseline','regression','fixed'],default='fixed')
    parser.add_argument('--provider',choices=['fixture','live'],default='fixture')
    parser.add_argument('--output',default='docs/report.json')
    parser.add_argument('--demo',action='store_true',help='Generate all three fixture runs for dashboard exploration')
    args=parser.parse_args()
    if args.demo and args.provider!='fixture':
        parser.error('--demo uses fixtures only; use --provider live without --demo')
    cases,policies=load('data/cases.json'),load('data/policies.json')
    names=['baseline','regression','fixed'] if args.demo else ['baseline',args.candidate]
    runs={name:evaluate(load(f'configs/{name}.json'),cases,policies,args.provider) for name in dict.fromkeys(names)}
    for run in runs.values():
        run['gate']=gate(runs['baseline'],run)
    report={'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),
            'mode':args.provider,'notice':'Deterministic fixture runs; these are not measured LLM capabilities.' if args.provider=='fixture' else 'Live model run; exact decision and citation checks, not semantic faithfulness scoring.',
            'runs':list(runs.values())}
    target=Path(args.output)
    if not target.is_absolute(): target=ROOT/target
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2)+'\n')
    result=runs[args.candidate]['gate'] if not args.demo else runs['fixed']['gate']
    print(json.dumps({'output':str(target),'gate':result['status'],'runs':{k:v['metrics'] for k,v in runs.items()}},indent=2))
    return 1 if result['status']=='blocked' else 0

if __name__=='__main__':
    sys.exit(main())
