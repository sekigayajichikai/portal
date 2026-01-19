import React, { useState } from 'react';
import { MOCK_MEMBERS } from '@/constants';
import { Member } from '@cc-saas/shared';
import { Search, Filter, MoreHorizontal, Check, X as XIcon } from 'lucide-react';

export const MemberManagement: React.FC = () => {
  const [filterGroup, setFilterGroup] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMembers = MOCK_MEMBERS.filter(member => {
    const matchesGroup = filterGroup === 'All' || member.group === filterGroup;
    const matchesSearch = member.name.includes(searchTerm) || member.address.includes(searchTerm);
    return matchesGroup && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="名前や住所で検索..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          {['All', '1班', '2班', '3班'].map((group) => (
            <button
              key={group}
              onClick={() => setFilterGroup(group)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterGroup === group 
                  ? 'bg-primary-500 text-white' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
              <th className="p-4 font-medium">氏名 / 住所</th>
              <th className="p-4 font-medium">所属</th>
              <th className="p-4 font-medium">連絡先</th>
              <th className="p-4 font-medium text-center">回覧板</th>
              <th className="p-4 font-medium text-center">会費</th>
              <th className="p-4 font-medium">役職</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredMembers.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <div className="font-bold text-slate-800">{member.name}</div>
                  <div className="text-xs text-slate-500">{member.address}</div>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    {member.group}
                  </span>
                </td>
                <td className="p-4 text-sm text-slate-600">{member.phone}</td>
                <td className="p-4 text-center">
                  {member.hasReadLatestCircular ? (
                    <span className="inline-flex justify-center items-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
                      <Check size={14} />
                    </span>
                  ) : (
                    <span className="inline-flex justify-center items-center w-6 h-6 rounded-full bg-slate-100 text-slate-400">
                      <XIcon size={14} />
                    </span>
                  )}
                </td>
                <td className="p-4 text-center">
                   {member.hasPaidFee ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      納入済
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-100">
                      未納
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    member.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                    member.role === 'leader' ? 'bg-blue-100 text-blue-700' :
                    'text-slate-500'
                  }`}>
                    {member.role === 'admin' ? '管理者' : member.role === 'leader' ? '班長' : '会員'}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <button className="text-slate-400 hover:text-slate-600">
                    <MoreHorizontal size={20} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMembers.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            該当する会員が見つかりません
          </div>
        )}
      </div>
    </div>
  );
};
